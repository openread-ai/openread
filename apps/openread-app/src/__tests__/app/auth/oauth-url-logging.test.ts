import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const authPage = readFileSync(path.resolve(__dirname, '../../../app/auth/page.tsx'), 'utf8');
const openWith = readFileSync(path.resolve(__dirname, '../../../helpers/openWith.ts'), 'utf8');
const useOpenWithBooks = readFileSync(
  path.resolve(__dirname, '../../../hooks/useOpenWithBooks.ts'),
  'utf8',
);

const rustSafariAuth = readFileSync(
  path.resolve(__dirname, '../../../../src-tauri/src/macos/safari_auth.rs'),
  'utf8',
);

const androidBridge = readFileSync(
  path.resolve(
    __dirname,
    '../../../../src-tauri/plugins/tauri-plugin-native-bridge/android/src/main/java/NativeBridgePlugin.kt',
  ),
  'utf8',
);

const iosBridge = readFileSync(
  path.resolve(
    __dirname,
    '../../../../src-tauri/plugins/tauri-plugin-native-bridge/ios/Sources/NativeBridgePlugin.swift',
  ),
  'utf8',
);

const extractCallExpressions = (source: string, receiver: string) => {
  const calls: string[] = [];
  let offset = 0;

  while ((offset = source.indexOf(receiver, offset)) !== -1) {
    const openParen = source.indexOf('(', offset + receiver.length);
    if (openParen === -1) break;

    let depth = 0;
    for (let index = openParen; index < source.length; index += 1) {
      if (source[index] === '(') depth += 1;
      if (source[index] === ')') depth -= 1;
      if (depth === 0) {
        calls.push(source.slice(offset, index + 1));
        offset = index + 1;
        break;
      }
    }
  }

  return calls;
};

describe('OAuth and deep-link URL logging', () => {
  it('does not log the raw OAuth URL or fragment on the auth page', () => {
    expect(authPage).not.toMatch(/logger\.(info|error|warn|debug)\(\s*['"][^'"]*['"]\s*,\s*url\b/);
    expect(authPage).not.toMatch(
      /logger\.(info|error|warn|debug)\(\s*['"][^'"]*['"]\s*,\s*args\?\.\[1\]/,
    );
    expect(authPage).toContain("logger.info('Handle OAuth URL'");
    expect(authPage).toContain("logger.info('Received deep link'");
    expect(authPage).toContain("logger.info('Received invalid OAuth URL')");
    expect(authPage).toContain('hasCallbackUrl: Boolean(args?.[1])');
  });

  it('redacts fragments at every changed TypeScript URL log sink', () => {
    expect(openWith).toContain("logger.info('Intent Open with URL:', urls.map(redactUrlFragment))");
    expect(openWith).toContain("logger.info('Skip non-file URL:', redactUrlFragment(url))");
    expect(useOpenWithBooks).toContain(
      "logger.info('Handle Open with URL:', urls.map(redactUrlFragment))",
    );
    expect(useOpenWithBooks).toContain('urls: payload.urls.map(redactUrlFragment)');
    expect(useOpenWithBooks).toContain('args: args.map(redactUrlFragment)');
  });

  it('redacts fragments before logging native auth callback and outbound URLs', () => {
    expect(rustSafariAuth).toContain('redact_url_fragment(&url_string_value)');
    expect(rustSafariAuth).toContain('Auth session callback URL');
    expect(androidBridge).toContain('Received intent: ${redactUrlFragment(uri.toString())}');
    expect(androidBridge).toContain('Launching OAuth URL: ${redactUrlFragment(args.authUrl)}');
  });

  it('never sends the iOS callback URL to a logger', () => {
    const authWithSafari = iosBridge.match(
      /@objc public func auth_with_safari[\s\S]*?\n  }\n\n  \/\//,
    )?.[0];
    expect(authWithSafari).toBeDefined();
    expect(authWithSafari).toContain('invoke.resolve(["redirectUrl": callbackURL.absoluteString])');
    expect(extractCallExpressions(authWithSafari!, 'logger.').join('\n')).not.toContain(
      'callbackURL.absoluteString',
    );
  });
});
