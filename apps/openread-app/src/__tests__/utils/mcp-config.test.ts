import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateMcpConfig,
  formatMcpConfig,
  getMcpConfigPath,
  getMcpSetupInstructions,
  maskApiKey,
  detectPlatform,
  MCP_CLIENTS,
  type McpClient,
} from '@/lib/mcp-config';

describe('MCP Config Utilities', () => {
  describe('generateMcpConfig', () => {
    it('should generate valid config structure', () => {
      const config = generateMcpConfig({ apiKey: 'or_test123' });

      expect(config.mcpServers.openread.command).toBe('npx');
      expect(config.mcpServers.openread.args).toContain('-y');
      expect(config.mcpServers.openread.args).toContain('@openread/mcp');
      expect(config.mcpServers.openread.env.OPENREAD_API_KEY).toBe('or_test123');
    });

    it('should NOT include OPENREAD_API_URL by default', () => {
      const config = generateMcpConfig({ apiKey: 'orsk-xxx' });

      expect(config.mcpServers.openread.env.OPENREAD_API_URL).toBeUndefined();
    });

    it('should NOT include OPENREAD_API_URL when baseUrl is provided without showAdvanced', () => {
      const config = generateMcpConfig({
        apiKey: 'orsk-xxx',
        baseUrl: 'https://custom.api.com',
      });

      expect(config.mcpServers.openread.env.OPENREAD_API_URL).toBeUndefined();
    });

    it('should include OPENREAD_API_URL when showAdvanced is true AND baseUrl is provided', () => {
      const config = generateMcpConfig({
        apiKey: 'orsk-xxx',
        showAdvanced: true,
        baseUrl: 'https://custom.api',
      });

      expect(config.mcpServers.openread.env.OPENREAD_API_URL).toBe('https://custom.api');
    });

    it('should NOT include OPENREAD_API_URL when showAdvanced is true but baseUrl is not provided', () => {
      const config = generateMcpConfig({
        apiKey: 'orsk-xxx',
        showAdvanced: true,
      });

      expect(config.mcpServers.openread.env.OPENREAD_API_URL).toBeUndefined();
    });

    it('should preserve API key exactly as provided', () => {
      const apiKey = 'or_secretkey123456789abcdef';
      const config = generateMcpConfig({ apiKey });

      expect(config.mcpServers.openread.env.OPENREAD_API_KEY).toBe(apiKey);
    });

    it('should always contain command "npx" and args ["-y", "@openread/mcp"]', () => {
      const config = generateMcpConfig({ apiKey: 'orsk-xxx' });

      expect(config.mcpServers.openread.command).toBe('npx');
      expect(config.mcpServers.openread.args).toEqual(['-y', '@openread/mcp']);
    });

    it('should always contain the provided API key under OPENREAD_API_KEY', () => {
      const apiKey = 'orsk-my-test-key-12345';
      const config = generateMcpConfig({ apiKey });

      expect(config.mcpServers.openread.env.OPENREAD_API_KEY).toBe(apiKey);
    });
  });

  describe('formatMcpConfig', () => {
    it('should format as valid JSON for claude-desktop', () => {
      const formatted = formatMcpConfig('claude-desktop', { apiKey: 'orsk-xxx' });

      expect(formatted).toContain('"mcpServers"');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('should format as valid JSON for cursor', () => {
      const formatted = formatMcpConfig('cursor', { apiKey: 'orsk-xxx' });

      expect(formatted).toContain('"mcpServers"');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('should format as valid JSON for claude-code (no comment header)', () => {
      const formatted = formatMcpConfig('claude-code', { apiKey: 'orsk-xxx' });

      expect(formatted).toContain('"mcpServers"');
      expect(() => JSON.parse(formatted)).not.toThrow();
      // Should NOT contain comment header
      expect(formatted).not.toContain('#');
    });

    it('should format as valid JSON for vscode', () => {
      const formatted = formatMcpConfig('vscode', { apiKey: 'orsk-xxx' });

      expect(formatted).toContain('"mcpServers"');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('should format as valid JSON for gemini-cli', () => {
      const formatted = formatMcpConfig('gemini-cli', { apiKey: 'orsk-xxx' });

      expect(formatted).toContain('"mcpServers"');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('should format as valid JSON for windsurf', () => {
      const formatted = formatMcpConfig('windsurf', { apiKey: 'orsk-xxx' });

      expect(formatted).toContain('"mcpServers"');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('should format as valid JSON for codex', () => {
      const formatted = formatMcpConfig('codex', { apiKey: 'orsk-xxx' });

      expect(formatted).toContain('"mcpServers"');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('should produce valid JSON.parse() output for all clients', () => {
      const allClients: McpClient[] = [
        'claude-desktop',
        'cursor',
        'claude-code',
        'vscode',
        'codex',
        'gemini-cli',
        'windsurf',
      ];

      allClients.forEach((client) => {
        const formatted = formatMcpConfig(client, { apiKey: 'orsk-xxx' });
        const parsed = JSON.parse(formatted);
        expect(parsed).toHaveProperty('mcpServers');
        expect(parsed.mcpServers).toHaveProperty('openread');
      });
    });

    it('should include API key in formatted output', () => {
      const apiKey = 'or_myapikey123';
      const formatted = formatMcpConfig('claude-desktop', { apiKey });

      expect(formatted).toContain(apiKey);
    });

    it('should include custom base URL in formatted output only with showAdvanced', () => {
      const baseUrl = 'https://my.custom.api.com';

      // Without showAdvanced, baseUrl should NOT appear
      const formattedDefault = formatMcpConfig('claude-desktop', {
        apiKey: 'or_test',
        baseUrl,
      });
      expect(formattedDefault).not.toContain(baseUrl);

      // With showAdvanced, baseUrl SHOULD appear
      const formattedAdvanced = formatMcpConfig('claude-desktop', {
        apiKey: 'or_test',
        baseUrl,
        showAdvanced: true,
      });
      expect(formattedAdvanced).toContain(baseUrl);
    });

    it('should always contain "command": "npx" and "args": ["-y", "@openread/mcp"] in output', () => {
      const allClients: McpClient[] = [
        'claude-desktop',
        'cursor',
        'claude-code',
        'vscode',
        'codex',
        'gemini-cli',
        'windsurf',
      ];

      allClients.forEach((client) => {
        const formatted = formatMcpConfig(client, { apiKey: 'orsk-xxx' });
        const parsed = JSON.parse(formatted);
        expect(parsed.mcpServers.openread.command).toBe('npx');
        expect(parsed.mcpServers.openread.args).toEqual(['-y', '@openread/mcp']);
      });
    });

    it('should always contain the provided API key under OPENREAD_API_KEY', () => {
      const apiKey = 'orsk-unique-key-for-test';
      const allClients: McpClient[] = [
        'claude-desktop',
        'cursor',
        'claude-code',
        'vscode',
        'codex',
        'gemini-cli',
        'windsurf',
      ];

      allClients.forEach((client) => {
        const formatted = formatMcpConfig(client, { apiKey });
        const parsed = JSON.parse(formatted);
        expect(parsed.mcpServers.openread.env.OPENREAD_API_KEY).toBe(apiKey);
      });
    });
  });

  describe('getMcpConfigPath', () => {
    describe('claude-desktop', () => {
      it('should return correct macOS path', () => {
        const path = getMcpConfigPath('claude-desktop', 'macos');
        expect(path).toBe('~/Library/Application Support/Claude/claude_desktop_config.json');
      });

      it('should return correct Windows path', () => {
        const path = getMcpConfigPath('claude-desktop', 'windows');
        expect(path).toContain('%APPDATA%');
        expect(path).toContain('Claude');
      });

      it('should return correct Linux path', () => {
        const path = getMcpConfigPath('claude-desktop', 'linux');
        expect(path).toBe('~/.config/claude/claude_desktop_config.json');
      });
    });

    describe('cursor', () => {
      it('should return correct macOS path', () => {
        const path = getMcpConfigPath('cursor', 'macos');
        expect(path).toContain('.cursor');
        expect(path).toContain('mcp.json');
      });

      it('should return correct Windows path', () => {
        const path = getMcpConfigPath('cursor', 'windows');
        expect(path).toContain('%USERPROFILE%');
        expect(path).toContain('.cursor');
      });

      it('should return correct Linux path', () => {
        const path = getMcpConfigPath('cursor', 'linux');
        expect(path).toBe('~/.cursor/mcp.json');
      });
    });

    describe('claude-code', () => {
      it('should return platform-specific paths', () => {
        const macosPath = getMcpConfigPath('claude-code', 'macos');
        const windowsPath = getMcpConfigPath('claude-code', 'windows');
        const linuxPath = getMcpConfigPath('claude-code', 'linux');

        expect(macosPath).toBe('~/.claude/settings.json');
        expect(windowsPath).toBe('%USERPROFILE%\\.claude\\settings.json');
        expect(linuxPath).toBe('~/.claude/settings.json');
      });
    });

    describe('new clients', () => {
      it('should return correct path for vscode', () => {
        const path = getMcpConfigPath('vscode', 'macos');
        expect(path).toBe('.vscode/mcp.json');
      });

      it('should return correct path for codex', () => {
        const path = getMcpConfigPath('codex', 'linux');
        expect(path).toBe('~/.codex/mcp.json');
      });

      it('should return correct path for gemini-cli', () => {
        const path = getMcpConfigPath('gemini-cli', 'windows');
        expect(path).toBe('%USERPROFILE%\\.gemini\\settings.json');
      });

      it('should return correct path for windsurf', () => {
        const path = getMcpConfigPath('windsurf', 'macos');
        expect(path).toBe('~/.windsurf/mcp.json');
      });
    });
  });

  describe('getMcpSetupInstructions', () => {
    it('should return instructions for claude-desktop', () => {
      const instructions = getMcpSetupInstructions('claude-desktop');

      expect(instructions).toBeInstanceOf(Array);
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions.some((i) => i.includes('Claude Desktop'))).toBe(true);
      expect(instructions.some((i) => i.includes('Restart'))).toBe(true);
    });

    it('should return instructions for cursor', () => {
      const instructions = getMcpSetupInstructions('cursor');

      expect(instructions).toBeInstanceOf(Array);
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions.some((i) => i.includes('Cursor'))).toBe(true);
    });

    it('should return instructions for claude-code', () => {
      const instructions = getMcpSetupInstructions('claude-code');

      expect(instructions).toBeInstanceOf(Array);
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions.some((i) => i.includes('terminal'))).toBe(true);
    });

    it('should return client-specific instructions for vscode', () => {
      const instructions = getMcpSetupInstructions('vscode');
      expect(instructions).toBeInstanceOf(Array);
      expect(instructions).toHaveLength(4);
      expect(instructions.some((i) => i.includes('VS Code'))).toBe(true);
    });

    it('should return client-specific instructions for codex', () => {
      const instructions = getMcpSetupInstructions('codex');
      expect(instructions).toBeInstanceOf(Array);
      expect(instructions).toHaveLength(3);
      expect(instructions.some((i) => i.includes('codex'))).toBe(true);
    });

    it('should return client-specific instructions for gemini-cli', () => {
      const instructions = getMcpSetupInstructions('gemini-cli');
      expect(instructions).toBeInstanceOf(Array);
      expect(instructions).toHaveLength(3);
      expect(instructions.some((i) => i.includes('Gemini'))).toBe(true);
    });

    it('should return client-specific instructions for windsurf', () => {
      const instructions = getMcpSetupInstructions('windsurf');
      expect(instructions).toBeInstanceOf(Array);
      expect(instructions).toHaveLength(5);
      expect(instructions.some((i) => i.includes('Windsurf'))).toBe(true);
      expect(instructions.some((i) => i.includes('Restart'))).toBe(true);
    });
  });

  describe('maskApiKey', () => {
    it('should mask API key correctly', () => {
      const masked = maskApiKey('or_abc1234567890');

      expect(masked).toMatch(/^or_abc1\*{32}$/);
      expect(masked).toHaveLength(7 + 32);
    });

    it('should return short keys unchanged', () => {
      expect(maskApiKey('short')).toBe('short');
      expect(maskApiKey('or_abc')).toBe('or_abc');
      expect(maskApiKey('1234567')).toBe('1234567');
    });

    it('should mask keys with exactly 8 characters', () => {
      const masked = maskApiKey('12345678');

      expect(masked).toBe('1234567' + '*'.repeat(32));
    });

    it('should handle very long keys', () => {
      const longKey = 'or_' + 'a'.repeat(100);
      const masked = maskApiKey(longKey);

      expect(masked.startsWith('or_aaaa')).toBe(true);
      expect(masked.endsWith('*'.repeat(32))).toBe(true);
      expect(masked).toHaveLength(39);
    });

    it('should handle empty string', () => {
      expect(maskApiKey('')).toBe('');
    });
  });

  describe('detectPlatform', () => {
    const originalUserAgent = global.navigator?.userAgent;

    beforeEach(() => {
      // Reset navigator mock
      if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'navigator', {
          value: { userAgent: '' },
          writable: true,
          configurable: true,
        });
      }
    });

    afterEach(() => {
      // Restore original
      if (typeof window !== 'undefined' && originalUserAgent) {
        Object.defineProperty(window, 'navigator', {
          value: { userAgent: originalUserAgent },
          writable: true,
          configurable: true,
        });
      }
    });

    it('should detect macOS', () => {
      Object.defineProperty(window, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        writable: true,
        configurable: true,
      });

      expect(detectPlatform()).toBe('macos');
    });

    it('should detect Windows', () => {
      Object.defineProperty(window, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        writable: true,
        configurable: true,
      });

      expect(detectPlatform()).toBe('windows');
    });

    it('should default to linux for unknown user agents', () => {
      Object.defineProperty(window, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
        writable: true,
        configurable: true,
      });

      expect(detectPlatform()).toBe('linux');
    });
  });

  describe('MCP_CLIENTS', () => {
    it('should have seven clients defined', () => {
      expect(MCP_CLIENTS).toHaveLength(7);
    });

    it('should have required properties for each client', () => {
      MCP_CLIENTS.forEach((client) => {
        expect(client).toHaveProperty('id');
        expect(client).toHaveProperty('label');
        expect(client).toHaveProperty('description');
        expect(client).toHaveProperty('configFormat');
        expect(typeof client.id).toBe('string');
        expect(typeof client.label).toBe('string');
        expect(typeof client.description).toBe('string');
        expect(typeof client.configFormat).toBe('string');
      });
    });

    it('should include all expected clients', () => {
      const clientIds = MCP_CLIENTS.map((c) => c.id);

      expect(clientIds).toContain('claude-desktop');
      expect(clientIds).toContain('cursor');
      expect(clientIds).toContain('claude-code');
      expect(clientIds).toContain('vscode');
      expect(clientIds).toContain('codex');
      expect(clientIds).toContain('gemini-cli');
      expect(clientIds).toContain('windsurf');
    });

    it('should have valid configFormat for each client', () => {
      const validFormats = ['mcp-json', 'settings-json', 'claude-desktop-json'];
      MCP_CLIENTS.forEach((client) => {
        expect(validFormats).toContain(client.configFormat);
      });
    });

    it('should have claude-desktop as first client (default selection)', () => {
      expect(MCP_CLIENTS[0].id).toBe('claude-desktop');
    });
  });
});
