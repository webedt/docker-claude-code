import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { ExecuteRequest, SSEEvent, SessionMetadata } from './types';
import { GitHubClient } from './clients/githubClient';
import { DBClient } from './clients/dbClient';
import { SessionManager } from './clients/sessionManager';
import { ProviderFactory } from './providers/ProviderFactory';
import { Response } from 'express';
import { logger } from './utils/logger';

/**
 * Main orchestrator for executing coding assistant requests
 * Handles session management, GitHub pulling, provider execution, and DB persistence
 */
export class Orchestrator {
  private githubClient: GitHubClient;
  private dbClient: DBClient;
  private sessionManager: SessionManager;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, dbBaseUrl?: string) {
    this.workspaceRoot = workspaceRoot;
    this.githubClient = new GitHubClient();
    this.dbClient = new DBClient(dbBaseUrl);
    this.sessionManager = new SessionManager(workspaceRoot);
  }

  /**
   * Execute a complete workflow request
   */
  async execute(request: ExecuteRequest, res: Response): Promise<void> {
    const startTime = Date.now();
    let chunkIndex = 0;
    let providerSessionId: string | undefined;

    // Determine session ID (resume existing or create new)
    const isResuming = !!request.resumeSessionId;
    const sessionId = isResuming ? request.resumeSessionId! : uuidv4();

    // Helper to send SSE events
    const sendEvent = (event: SSEEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Persist to local session workspace
      try {
        this.sessionManager.appendStreamEvent(sessionId, event);
      } catch (err) {
        console.error('[SessionManager] Failed to persist event:', err);
      }

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

      // Step 2: Handle session workspace
      let workspacePath: string;
      let metadata: SessionMetadata | null = null;

      if (isResuming) {
        // Resume existing session
        logger.info('Resuming existing session', {
          component: 'Orchestrator',
          sessionId,
          provider: request.codingAssistantProvider
        });

        if (!this.sessionManager.sessionExists(sessionId)) {
          throw new Error(`Session not found: ${sessionId}`);
        }

        metadata = this.sessionManager.loadMetadata(sessionId);
        if (!metadata) {
          throw new Error(`Session metadata not found: ${sessionId}`);
        }

        // Get the provider session ID for resume
        providerSessionId = metadata.providerSessionId;

        // Get execution workspace path
        workspacePath = this.sessionManager.getExecutionWorkspace(sessionId);

        console.log(`[Orchestrator] Loaded session metadata:`, metadata);
        console.log(`[Orchestrator] Workspace path: ${workspacePath}`);

        // Check if workspace actually exists (resilience for pruned volumes)
        if (!fs.existsSync(workspacePath)) {
          console.warn(`[Orchestrator] Workspace missing for session ${sessionId}, attempting recovery...`);

          // Recovery Strategy: Re-clone from GitHub if we have the metadata
          if (metadata.github) {
            sendEvent({
              type: 'message',
              message: `Workspace missing, recovering from GitHub: ${metadata.github.repoUrl}`,
              timestamp: new Date().toISOString()
            });

            const sessionRoot = this.sessionManager.getSessionWorkspace(sessionId);

            try {
              // Try to re-clone the repository
              const pullResult = await this.githubClient.pullRepository({
                repoUrl: metadata.github.repoUrl,
                branch: metadata.github.branch,
                directory: metadata.github.clonedPath,
                workspaceRoot: sessionRoot
              });

              workspacePath = pullResult.targetPath;

              // Update metadata if branch changed (fallback to default)
              if (pullResult.branch !== metadata.github.branch) {
                console.warn(
                  `[Orchestrator] Branch '${metadata.github.branch}' not found, ` +
                  `recovered using branch '${pullResult.branch}'`
                );
                metadata.github.branch = pullResult.branch;
                this.sessionManager.saveMetadata(sessionId, metadata);
              }

              sendEvent({
                type: 'github_pull_progress',
                data: {
                  type: 'completed',
                  message: `Workspace recovered from GitHub (branch: ${pullResult.branch})`,
                  targetPath: workspacePath
                },
                timestamp: new Date().toISOString()
              });

              console.log(`[Orchestrator] Workspace recovered: ${workspacePath}`);
            } catch (recoveryError) {
              console.error('[Orchestrator] Failed to recover workspace from GitHub:', recoveryError);
              throw new Error(
                `Cannot resume session: workspace missing and recovery failed. ` +
                `Original error: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown'}`
              );
            }
          } else {
            // No GitHub metadata - cannot recover
            throw new Error(
              `Cannot resume session: workspace missing and no GitHub metadata available for recovery. ` +
              `The session workspace may have been pruned.`
            );
          }
        }
      } else {
        // Create new session
        logger.info('Creating new session', {
          component: 'Orchestrator',
          sessionId,
          provider: request.codingAssistantProvider
        });

        workspacePath = this.sessionManager.createSessionWorkspace(sessionId);

        // Create initial metadata
        metadata = this.sessionManager.createMetadata(
          sessionId,
          request.codingAssistantProvider
        );

        logger.info('Session workspace created', {
          component: 'Orchestrator',
          sessionId,
          workspacePath
        });
      }

      // Step 3: Send connection event
      sendEvent({
        type: 'connected',
        sessionId,
        resuming: isResuming,
        resumedFrom: isResuming ? sessionId : undefined,
        provider: request.codingAssistantProvider,
        timestamp: new Date().toISOString()
      });

      // Step 4: Pull GitHub repository (only for new sessions with GitHub config)
      if (request.github && !isResuming) {
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
          workspaceRoot: workspacePath
        });

        // Extract relative path for metadata
        const repoName = pullResult.targetPath.replace(workspacePath + '/', '');

        // Update metadata with GitHub info
        metadata.github = {
          repoUrl: request.github.repoUrl,
          branch: pullResult.branch,
          clonedPath: repoName
        };

        // Update workspace path to cloned repo
        workspacePath = pullResult.targetPath;

        // Save metadata
        this.sessionManager.saveMetadata(sessionId, metadata);

        sendEvent({
          type: 'github_pull_progress',
          data: {
            type: 'completed',
            message: pullResult.wasCloned ? 'Repository cloned successfully' : 'Repository updated successfully',
            targetPath: pullResult.targetPath
          },
          timestamp: new Date().toISOString()
        });

        console.log(`[Orchestrator] Repository cloned to: ${workspacePath}`);
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
          resumeSessionId: providerSessionId, // Use provider's internal session ID
          providerOptions: request.providerOptions
        },
        (event) => {
          // Extract provider session ID from init message
          if (event.type === 'assistant_message' &&
              event.data?.type === 'system' &&
              event.data?.subtype === 'init' &&
              event.data?.session_id) {
            const newProviderSessionId = event.data.session_id;
            console.log(`[Orchestrator] Provider session ID: ${newProviderSessionId}`);

            // Save provider session ID to metadata
            this.sessionManager.updateProviderSessionId(sessionId, newProviderSessionId);
          }

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

      logger.info('Session completed successfully', {
        component: 'Orchestrator',
        sessionId,
        provider: request.codingAssistantProvider,
        durationMs: duration
      });
      res.end();
    } catch (error) {
      logger.error('Error during execution', error, {
        component: 'Orchestrator',
        sessionId,
        provider: request.codingAssistantProvider
      });

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

    // Cannot provide both GitHub and resumeSessionId
    if (request.github && request.resumeSessionId) {
      throw new Error(
        'Cannot provide both "github" and "resumeSessionId". ' +
        'When resuming a session, the repository is already available in the session workspace.'
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
    if (error.message?.includes('Session not found')) {
      return 'session_not_found';
    }
    if (error.message?.includes('token')) {
      return 'auth_error';
    }
    if (error.message?.includes('repository') || error.message?.includes('not found')) {
      return 'repo_not_found';
    }
    if (error.message?.includes('Cannot provide both')) {
      return 'invalid_request';
    }
    return 'internal_error';
  }
}
