import { BaseProvider, ProviderOptions, ProviderStreamEvent } from './BaseProvider';

/**
 * Codex provider for Cursor/OpenAI Codex integration
 *
 * Note: This is a placeholder implementation. The actual Cursor/Codex SDK
 * integration will be added when the SDK is available.
 */
export class CodexProvider extends BaseProvider {
  constructor(accessToken: string, workspace: string) {
    super(accessToken, workspace);
  }

  async execute(
    userRequest: string,
    options: ProviderOptions,
    onEvent: (event: ProviderStreamEvent) => void
  ): Promise<void> {
    console.log('[CodexProvider] Starting execution...');

    // Send init message
    onEvent({
      type: 'assistant_message',
      data: {
        type: 'system',
        subtype: 'init',
        session_id: `codex-${Date.now()}`,
        message: 'Codex provider initialized'
      }
    });

    // TODO: Integrate with actual Cursor/Codex SDK
    // For now, send a placeholder message
    onEvent({
      type: 'assistant_message',
      data: {
        type: 'text',
        text: 'Codex provider is not yet fully implemented. This is a placeholder response.'
      }
    });

    console.log('[CodexProvider] Execution completed');
  }

  async validateToken(): Promise<boolean> {
    // TODO: Implement actual token validation
    return this.accessToken !== '';
  }

  getProviderName(): string {
    return 'codex';
  }
}
