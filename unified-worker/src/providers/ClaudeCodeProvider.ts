import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider, ProviderOptions, ProviderStreamEvent } from './BaseProvider';

/**
 * Claude Code provider implementation
 */
export class ClaudeCodeProvider extends BaseProvider {
  private model: string;

  constructor(accessToken: string, workspace: string, model?: string) {
    super(accessToken, workspace);
    this.model = model || 'claude-sonnet-4-5-20250929';
  }

  /**
   * Execute a user request using Claude Code
   */
  async execute(
    userRequest: string,
    options: ProviderOptions,
    onEvent: (event: ProviderStreamEvent) => void
  ): Promise<void> {
    const queryOptions = this.createQueryOptions(options);

    try {
      const queryStream = query({
        prompt: userRequest,
        options: queryOptions
      });

      // Stream messages from Claude Code
      for await (const message of queryStream) {
        onEvent({
          type: 'assistant_message',
          data: message
        });
      }

      // Success - no explicit completion event needed
      // The orchestrator will handle completion
    } catch (error) {
      // Re-throw to let orchestrator handle
      throw error;
    }
  }

  /**
   * Validate Claude Code access token
   * Note: The SDK handles authentication via credentials file
   * This is a placeholder for future token validation
   */
  async validateToken(): Promise<boolean> {
    // The Claude Agent SDK reads from .claude/.credentials.json
    // which is set up via CLAUDE_CODE_CREDENTIALS_JSON environment variable
    // For now, we'll assume it's valid if the environment is set up correctly
    return true;
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'claude-code';
  }

  /**
   * Create Claude Code query options
   */
  private createQueryOptions(options: ProviderOptions): Options {
    const { resumeSessionId, providerOptions = {} } = options;

    const skipPermissions = providerOptions.skipPermissions ?? true;

    const queryOptions: Options = {
      model: providerOptions.model || this.model,
      cwd: this.workspace,
      systemPrompt: `You are Claude Code, running in a containerized environment. The working directory is ${this.workspace}.`,
      allowDangerouslySkipPermissions: skipPermissions,
      permissionMode: skipPermissions ? 'bypassPermissions' : 'default',
    };

    // Add resume option if session ID is provided
    if (resumeSessionId) {
      queryOptions.resume = resumeSessionId;
    }

    return queryOptions;
  }
}
