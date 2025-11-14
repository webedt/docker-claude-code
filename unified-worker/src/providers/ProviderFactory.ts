import { BaseProvider } from './BaseProvider';
import { ClaudeCodeProvider } from './ClaudeCodeProvider';

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

      // Future providers:
      // case 'cursor':
      //   return new CursorProvider(accessToken, workspace);
      // case 'copilot':
      //   return new CopilotProvider(accessToken, workspace);
      // case 'aider':
      //   return new AiderProvider(accessToken, workspace);

      default:
        throw new Error(`Unsupported provider: ${providerName}. Supported providers: claude-code`);
    }
  }

  /**
   * Get list of supported providers
   */
  static getSupportedProviders(): string[] {
    return ['claude-code'];
  }

  /**
   * Check if a provider is supported
   */
  static isProviderSupported(providerName: string): boolean {
    const normalizedName = providerName.toLowerCase().trim();
    return this.getSupportedProviders().includes(normalizedName);
  }
}
