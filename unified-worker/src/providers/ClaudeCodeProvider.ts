import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider, ProviderOptions, ProviderStreamEvent } from './BaseProvider';
import { CredentialManager } from '../utils/credentialManager';

/**
 * Claude Code provider implementation
 */
export class ClaudeCodeProvider extends BaseProvider {
  private model: string;

  constructor(authentication: string, workspace: string, model?: string) {
    super(authentication, workspace);
    this.model = model || 'claude-sonnet-4-5-20250929';

    // Write authentication to ~/.claude/.credentials.json
    CredentialManager.writeClaudeCredentials(authentication);
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

    console.log('[ClaudeCodeProvider] Starting execution with options:', {
      model: queryOptions.model,
      cwd: queryOptions.cwd,
      permissionMode: queryOptions.permissionMode,
      resumeSessionId: queryOptions.resume
    });

    try {
      const queryStream = query({
        prompt: userRequest,
        options: queryOptions
      });

      let lastMessage: any = null;

      // Stream messages from Claude Code
      for await (const message of queryStream) {
        lastMessage = message;

        // Log important message types
        if (message.type === 'system' && message.subtype === 'init') {
          console.log('[ClaudeCodeProvider] Claude Code initialized, session:', message.session_id);
        }

        // Log error messages
        if (message.type === 'assistant' && message.message?.content) {
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                console.log('[ClaudeCodeProvider] Assistant message:', item.text);
              }
            }
          }
        }

        // Log result messages
        if (message.type === 'result') {
          console.log('[ClaudeCodeProvider] Result:', {
            subtype: message.subtype,
            is_error: message.is_error,
            duration_ms: message.duration_ms,
            error_message: (message as any).error_message || (message as any).result
          });
        }

        onEvent({
          type: 'assistant_message',
          data: message
        });
      }

      console.log('[ClaudeCodeProvider] Execution completed successfully');
    } catch (error) {
      console.error('[ClaudeCodeProvider] Execution error:', error);
      console.error('[ClaudeCodeProvider] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        code: (error as any)?.code,
        exitCode: (error as any)?.exitCode
      });

      // Re-throw to let orchestrator handle
      throw error;
    }
  }

  /**
   * Validate Claude Code authentication
   * Verifies that credentials are written to ~/.claude/.credentials.json
   */
  async validateToken(): Promise<boolean> {
    try {
      const credPath = CredentialManager.getClaudeCredentialPath();
      return CredentialManager.credentialFileExists(credPath);
    } catch (error) {
      console.error('[ClaudeCodeProvider] Token validation failed:', error);
      return false;
    }
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
