import { BaseProvider } from './BaseProvider';
import { ClaudeCodeProvider } from './ClaudeCodeProvider';
import { CodexProvider } from './CodexProvider';

/**
 * Factory for creating coding assistant provider instances
 */
export class ProviderFactory {
  /**
   * Create a provider instance based on provider name
   */
  static createProvider(
    providerName: string,
    accessToken: string,
    workspace: string,
    options?: Record<string, any>
  ): BaseProvider {
    const normalizedName = providerName.toLowerCase().trim();

    switch (normalizedName) {
      case 'claude-code':
      case 'claude':
        return new ClaudeCodeProvider(accessToken, workspace, options?.model);

      case 'codex':
      case 'cursor':
        return new CodexProvider(accessToken, workspace);

      // Future providers:
      // case 'copilot':
      //   return new CopilotProvider(accessToken, workspace);
      // case 'aider':
      //   return new AiderProvider(accessToken, workspace);

      default:
        throw new Error(
          `Unsupported provider: ${providerName}. ` +
          `Supported providers: ${this.getSupportedProviders().join(', ')}`
        );
    }
  }

  /**
   * Get list of supported providers
   */
  static getSupportedProviders(): string[] {
    return ['claude-code', 'codex', 'cursor'];
  }

  /**
   * Check if a provider is supported
   */
  static isProviderSupported(providerName: string): boolean {
    const normalizedName = providerName.toLowerCase().trim();
    return this.getSupportedProviders().includes(normalizedName);
  }
}
