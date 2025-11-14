import { ExecuteRequest } from '../types';

export interface ProviderOptions {
  accessToken: string;
  workspace: string;
  resumeSessionId?: string;
  providerOptions?: Record<string, any>;
}

export interface ProviderStreamEvent {
  type: string;
  data: any;
}

/**
 * Base interface for all coding assistant providers
 */
export abstract class BaseProvider {
  protected accessToken: string;
  protected workspace: string;

  constructor(accessToken: string, workspace: string) {
    this.accessToken = accessToken;
    this.workspace = workspace;
  }

  /**
   * Execute a user request and stream results
   * @param userRequest The user's prompt/instruction
   * @param options Provider-specific options
   * @param onEvent Callback for each streaming event
   */
  abstract execute(
    userRequest: string,
    options: ProviderOptions,
    onEvent: (event: ProviderStreamEvent) => void
  ): Promise<void>;

  /**
   * Validate the provider's access token
   */
  abstract validateToken(): Promise<boolean>;

  /**
   * Get provider name
   */
  abstract getProviderName(): string;
}
