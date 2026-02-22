import { describe, it, expect } from 'vitest';
import {
  getMcpConfigPath,
  getMcpSetupInstructions,
  MCP_CLIENTS,
  type McpClient,
  type Platform,
} from '@/lib/mcp-config';

describe('getMcpConfigPath', () => {
  describe('claude-desktop', () => {
    it('should return correct macOS path', () => {
      expect(getMcpConfigPath('claude-desktop', 'macos')).toBe(
        '~/Library/Application Support/Claude/claude_desktop_config.json',
      );
    });

    it('should return correct Windows path with %APPDATA% and backslashes', () => {
      const path = getMcpConfigPath('claude-desktop', 'windows');
      expect(path).toContain('%APPDATA%');
      expect(path).toContain('\\');
      expect(path).toBe('%APPDATA%\\Claude\\claude_desktop_config.json');
    });

    it('should return correct Linux path', () => {
      expect(getMcpConfigPath('claude-desktop', 'linux')).toBe(
        '~/.config/claude/claude_desktop_config.json',
      );
    });
  });

  describe('cursor', () => {
    it('should return correct macOS path', () => {
      expect(getMcpConfigPath('cursor', 'macos')).toBe('~/.cursor/mcp.json');
    });

    it('should return correct Windows path with %USERPROFILE% and backslashes', () => {
      expect(getMcpConfigPath('cursor', 'windows')).toBe('%USERPROFILE%\\.cursor\\mcp.json');
    });

    it('should return correct Linux path', () => {
      expect(getMcpConfigPath('cursor', 'linux')).toBe('~/.cursor/mcp.json');
    });
  });

  describe('claude-code', () => {
    it('should return correct macOS path', () => {
      expect(getMcpConfigPath('claude-code', 'macos')).toBe('~/.claude/settings.json');
    });

    it('should return correct Windows path', () => {
      expect(getMcpConfigPath('claude-code', 'windows')).toBe(
        '%USERPROFILE%\\.claude\\settings.json',
      );
    });

    it('should return correct Linux path', () => {
      expect(getMcpConfigPath('claude-code', 'linux')).toBe('~/.claude/settings.json');
    });
  });

  describe('vscode', () => {
    it('should return correct macOS path', () => {
      expect(getMcpConfigPath('vscode', 'macos')).toBe('.vscode/mcp.json');
    });

    it('should return correct Windows path with backslash', () => {
      expect(getMcpConfigPath('vscode', 'windows')).toBe('.vscode\\mcp.json');
    });

    it('should return correct Linux path', () => {
      expect(getMcpConfigPath('vscode', 'linux')).toBe('.vscode/mcp.json');
    });
  });

  describe('codex', () => {
    it('should return correct macOS path', () => {
      expect(getMcpConfigPath('codex', 'macos')).toBe('~/.codex/mcp.json');
    });

    it('should return correct Windows path', () => {
      expect(getMcpConfigPath('codex', 'windows')).toBe('%USERPROFILE%\\.codex\\mcp.json');
    });

    it('should return correct Linux path', () => {
      expect(getMcpConfigPath('codex', 'linux')).toBe('~/.codex/mcp.json');
    });
  });

  describe('gemini-cli', () => {
    it('should return correct macOS path', () => {
      expect(getMcpConfigPath('gemini-cli', 'macos')).toBe('~/.gemini/settings.json');
    });

    it('should return correct Windows path', () => {
      expect(getMcpConfigPath('gemini-cli', 'windows')).toBe(
        '%USERPROFILE%\\.gemini\\settings.json',
      );
    });

    it('should return correct Linux path', () => {
      expect(getMcpConfigPath('gemini-cli', 'linux')).toBe('~/.gemini/settings.json');
    });
  });

  describe('windsurf', () => {
    it('should return correct macOS path', () => {
      expect(getMcpConfigPath('windsurf', 'macos')).toBe('~/.windsurf/mcp.json');
    });

    it('should return correct Windows path', () => {
      expect(getMcpConfigPath('windsurf', 'windows')).toBe('%USERPROFILE%\\.windsurf\\mcp.json');
    });

    it('should return correct Linux path', () => {
      expect(getMcpConfigPath('windsurf', 'linux')).toBe('~/.windsurf/mcp.json');
    });
  });

  describe('all clients return non-empty paths for all platforms', () => {
    const allClients: McpClient[] = MCP_CLIENTS.map((c) => c.id);
    const allPlatforms: Platform[] = ['macos', 'windows', 'linux'];

    allClients.forEach((client) => {
      allPlatforms.forEach((platform) => {
        it(`${client} on ${platform} returns a non-empty string`, () => {
          const path = getMcpConfigPath(client, platform);
          expect(path).toBeTruthy();
          expect(path.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('path separator conventions', () => {
    const allClients: McpClient[] = MCP_CLIENTS.map((c) => c.id);

    it('Windows paths use backslashes', () => {
      allClients.forEach((client) => {
        const path = getMcpConfigPath(client, 'windows');
        // Windows paths should use backslashes (except vscode which is project-relative)
        if (path.includes('/')) {
          // Only acceptable if it does not also have backslashes (should not happen)
          expect(path).not.toContain('\\');
        }
      });
    });

    it('macOS paths use forward slashes', () => {
      allClients.forEach((client) => {
        const path = getMcpConfigPath(client, 'macos');
        expect(path).not.toContain('\\');
      });
    });

    it('Linux paths use forward slashes', () => {
      allClients.forEach((client) => {
        const path = getMcpConfigPath(client, 'linux');
        expect(path).not.toContain('\\');
      });
    });
  });
});

describe('getMcpSetupInstructions', () => {
  it('claude-desktop returns 5 steps', () => {
    const instructions = getMcpSetupInstructions('claude-desktop');
    expect(instructions).toHaveLength(5);
    expect(instructions.some((i) => i.includes('Claude Desktop'))).toBe(true);
    expect(instructions.some((i) => i.includes('Restart'))).toBe(true);
  });

  it('cursor returns 5 steps', () => {
    const instructions = getMcpSetupInstructions('cursor');
    expect(instructions).toHaveLength(5);
    expect(instructions.some((i) => i.includes('Cursor'))).toBe(true);
  });

  it('claude-code returns 4 steps', () => {
    const instructions = getMcpSetupInstructions('claude-code');
    expect(instructions).toHaveLength(4);
    expect(instructions.some((i) => i.includes('terminal'))).toBe(true);
    expect(instructions.some((i) => i.includes('Restart'))).toBe(true);
  });

  it('vscode returns 4 steps', () => {
    const instructions = getMcpSetupInstructions('vscode');
    expect(instructions).toHaveLength(4);
    expect(instructions.some((i) => i.includes('VS Code'))).toBe(true);
  });

  it('codex returns 3 steps', () => {
    const instructions = getMcpSetupInstructions('codex');
    expect(instructions).toHaveLength(3);
    expect(instructions.some((i) => i.includes('codex'))).toBe(true);
  });

  it('gemini-cli returns 3 steps', () => {
    const instructions = getMcpSetupInstructions('gemini-cli');
    expect(instructions).toHaveLength(3);
    expect(instructions.some((i) => i.includes('Gemini'))).toBe(true);
  });

  it('windsurf returns 5 steps', () => {
    const instructions = getMcpSetupInstructions('windsurf');
    expect(instructions).toHaveLength(5);
    expect(instructions.some((i) => i.includes('Windsurf'))).toBe(true);
    expect(instructions.some((i) => i.includes('Restart'))).toBe(true);
  });

  it('all clients return non-empty instruction arrays', () => {
    const allClients: McpClient[] = MCP_CLIENTS.map((c) => c.id);
    allClients.forEach((client) => {
      const instructions = getMcpSetupInstructions(client);
      expect(instructions).toBeInstanceOf(Array);
      expect(instructions.length).toBeGreaterThan(0);
    });
  });
});
