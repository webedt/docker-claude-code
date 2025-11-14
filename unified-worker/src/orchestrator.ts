import { v4 as uuidv4 } from 'uuid';
import { ExecuteRequest, SSEEvent, ExecutionContext } from './types';
import { GitHubClient } from './clients/githubClient';
import { DBClient } from './clients/dbClient';
import { ProviderFactory } from './providers/ProviderFactory';
import { Response } from 'express';

/**
 * Main orchestrator for executing coding assistant requests
 * Handles GitHub pulling, provider execution, and DB persistence
 */
export class Orchestrator {
  private githubClient: GitHubClient;
  private dbClient: DBClient;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, dbBaseUrl?: string) {
    this.workspaceRoot = workspaceRoot;
    this.githubClient = new GitHubClient();
    this.dbClient = new DBClient(dbBaseUrl);
  }

  /**
   * Execute a complete workflow request
   */
  async execute(request: ExecuteRequest, res: Response): Promise<void> {
    const startTime = Date.now();
    const sessionId = request.resumeSessionId || uuidv4();
    let chunkIndex = 0;

    // Helper to send SSE events
    const sendEvent = (event: SSEEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Persist to DB if configured
      if (request.database) {
        this.dbClient.appendChunk(
          {
            sessionId: request.database.sessionId,
            accessToken: request.database.accessToken
          },
          {
            sessionId: request.database.sessionId,
            chunkIndex: chunkIndex++,
            type: event.type,
            content: event,
            timestamp: event.timestamp
          }
        ).catch(err => {
          console.error('[DB] Failed to persist chunk:', err);
        });
      }
    };

    try {
      // Step 1: Validate request
      this.validateRequest(request);

      // Step 2: Determine workspace path
      let workspacePath = request.workspace?.path || this.workspaceRoot;

      // Step 3: Send connection event
      sendEvent({
        type: 'connected',
        sessionId,
        resuming: !!request.resumeSessionId,
        resumedFrom: request.resumeSessionId,
        provider: request.codingAssistantProvider,
        timestamp: new Date().toISOString()
      });

      // Step 4: Pull GitHub repository if specified (and not resuming)
      if (request.github && !request.resumeSessionId) {
        sendEvent({
          type: 'message',
          message: `Pulling repository: ${request.github.repoUrl}`,
          timestamp: new Date().toISOString()
        });

        const pullResult = await this.githubClient.pullRepository({
          repoUrl: request.github.repoUrl,
          branch: request.github.branch,
          directory: request.github.directory,
          accessToken: request.github.accessToken,
          workspaceRoot: this.workspaceRoot
        });

        workspacePath = pullResult.targetPath;

        sendEvent({
          type: 'github_pull_progress',
          data: {
            type: 'completed',
            message: pullResult.wasCloned ? 'Repository cloned successfully' : 'Repository updated successfully',
            targetPath: pullResult.targetPath
          },
          timestamp: new Date().toISOString()
        });
      }

      // Update DB with session metadata
      if (request.database) {
        await this.dbClient.updateSession(
          {
            sessionId: request.database.sessionId,
            accessToken: request.database.accessToken
          },
          {
            userRequest: request.userRequest,
            provider: request.codingAssistantProvider,
            status: 'active',
            startTime
          }
        );
      }

      // Step 5: Create provider instance
      sendEvent({
        type: 'message',
        message: `Executing with ${request.codingAssistantProvider}`,
        timestamp: new Date().toISOString()
      });

      const provider = ProviderFactory.createProvider(
        request.codingAssistantProvider,
        request.codingAssistantAccessToken,
        workspacePath,
        request.providerOptions
      );

      // Step 6: Execute provider and stream results
      await provider.execute(
        request.userRequest,
        {
          accessToken: request.codingAssistantAccessToken,
          workspace: workspacePath,
          resumeSessionId: request.resumeSessionId,
          providerOptions: request.providerOptions
        },
        (event) => {
          // Forward provider events to SSE stream
          sendEvent({
            ...event,
            timestamp: new Date().toISOString()
          });
        }
      );

      // Step 7: Send completion event
      const duration = Date.now() - startTime;
      sendEvent({
        type: 'completed',
        sessionId,
        duration_ms: duration,
        timestamp: new Date().toISOString()
      });

      // Update DB with completion
      if (request.database) {
        await this.dbClient.updateSession(
          {
            sessionId: request.database.sessionId,
            accessToken: request.database.accessToken
          },
          {
            userRequest: request.userRequest,
            provider: request.codingAssistantProvider,
            status: 'completed',
            endTime: Date.now()
          }
        );
      }

      res.end();
    } catch (error) {
      console.error('[Orchestrator] Error during execution:', error);

      // Send error event
      sendEvent({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        code: this.getErrorCode(error),
        timestamp: new Date().toISOString()
      });

      // Update DB with error
      if (request.database) {
        await this.dbClient.updateSession(
          {
            sessionId: request.database.sessionId,
            accessToken: request.database.accessToken
          },
          {
            userRequest: request.userRequest,
            provider: request.codingAssistantProvider,
            status: 'error',
            endTime: Date.now()
          }
        ).catch(err => console.error('[DB] Failed to update error status:', err));
      }

      res.end();
      throw error; // Re-throw to trigger worker exit
    }
  }

  /**
   * Validate request payload
   */
  private validateRequest(request: ExecuteRequest): void {
    if (!request.userRequest || request.userRequest.trim() === '') {
      throw new Error('userRequest is required');
    }

    if (!request.codingAssistantProvider || request.codingAssistantProvider.trim() === '') {
      throw new Error('codingAssistantProvider is required');
    }

    if (!request.codingAssistantAccessToken || request.codingAssistantAccessToken.trim() === '') {
      throw new Error('codingAssistantAccessToken is required');
    }

    if (!ProviderFactory.isProviderSupported(request.codingAssistantProvider)) {
      throw new Error(
        `Unsupported provider: ${request.codingAssistantProvider}. ` +
        `Supported providers: ${ProviderFactory.getSupportedProviders().join(', ')}`
      );
    }

    if (request.github) {
      if (!request.github.repoUrl || request.github.repoUrl.trim() === '') {
        throw new Error('github.repoUrl is required when github integration is enabled');
      }
    }

    if (request.database) {
      if (!request.database.sessionId || request.database.sessionId.trim() === '') {
        throw new Error('database.sessionId is required when database persistence is enabled');
      }
      if (!request.database.accessToken || request.database.accessToken.trim() === '') {
        throw new Error('database.accessToken is required when database persistence is enabled');
      }
    }
  }

  /**
   * Get error code from error object
   */
  private getErrorCode(error: any): string {
    if (error.message?.includes('token')) {
      return 'auth_error';
    }
    if (error.message?.includes('repository') || error.message?.includes('not found')) {
      return 'repo_not_found';
    }
    return 'internal_error';
  }
}
