import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { ExecuteRequest, SSEEvent, SessionMetadata } from './types';
import { GitHubClient } from './clients/githubClient';
import { DBClient } from './clients/dbClient';
import { SessionStorage } from './storage/sessionStorage';
import { ProviderFactory } from './providers/ProviderFactory';
import { Response } from 'express';
import { logger } from './utils/logger';
import { LLMHelper, generateBranchName } from './utils/llmHelper';
import { GitHelper } from './utils/gitHelper';

/**
 * Main orchestrator for executing coding assistant requests
 * Uses MinIO for session storage - downloads session at start, uploads at end
 */
export class Orchestrator {
  private githubClient: GitHubClient;
  private dbClient: DBClient;
  private sessionStorage: SessionStorage;
  private tmpDir: string;

  constructor(tmpDir: string, dbBaseUrl?: string) {
    this.tmpDir = tmpDir || '/tmp';
    this.githubClient = new GitHubClient();
    this.dbClient = new DBClient(dbBaseUrl);
    this.sessionStorage = new SessionStorage();
  }

  /**
   * Initialize the orchestrator (call once on startup)
   */
  async initialize(): Promise<void> {
    await this.sessionStorage.initialize();
  }

  /**
   * Execute a complete workflow request
   */
  async execute(request: ExecuteRequest, res: Response): Promise<void> {
    const startTime = Date.now();
    let chunkIndex = 0;
    let providerSessionId: string | undefined;
    let workspacePath: string | undefined;

    // Determine session ID (resume existing or create new)
    const isResuming = !!request.resumeSessionId;
    const sessionId = isResuming ? request.resumeSessionId! : uuidv4();

    // Local workspace path (ephemeral - in /tmp)
    workspacePath = path.join(this.tmpDir, `session-${sessionId}`);

    // Helper to send SSE events
    const sendEvent = (event: SSEEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Persist to local session workspace (will be uploaded to MinIO at end)
      try {
        this.sessionStorage.appendStreamEvent(sessionId, workspacePath!, event);
      } catch (err) {
        logger.error('Failed to persist event', err, {
          component: 'Orchestrator',
          sessionId
        });
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
          logger.error('Failed to persist chunk to DB', err, {
            component: 'Orchestrator',
            sessionId
          });
        });
      }
    };

    try {
      // Step 1: Validate request
      this.validateRequest(request);

      // Step 2: Download session from MinIO (or create new)
      logger.info('Downloading session from storage', {
        component: 'Orchestrator',
        sessionId,
        isResuming,
        provider: request.codingAssistantProvider
      });

      const sessionExisted = await this.sessionStorage.downloadSession(sessionId, workspacePath);

      // Load metadata if session exists
      let metadata: SessionMetadata | null = null;
      if (sessionExisted) {
        metadata = await this.sessionStorage.getMetadata(sessionId, workspacePath);

        if (metadata) {
          providerSessionId = metadata.providerSessionId;
          logger.info('Loaded session metadata', {
            component: 'Orchestrator',
            sessionId,
            providerSessionId
          });
        }
      }

      // Create metadata if new session
      if (!metadata) {
        metadata = {
          sessionId,
          provider: request.codingAssistantProvider,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.sessionStorage.saveMetadata(sessionId, workspacePath, metadata);
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

      // Step 3.5: Generate session name (only for new sessions)
      let sessionName: string | undefined;
      let branchName: string | undefined;

      if (!isResuming) {
        // Extract API key for LLM helper
        const apiKey = this.extractApiKey(request.codingAssistantAuthentication);

        if (apiKey) {
          try {
            const llmHelper = new LLMHelper(apiKey);
            sessionName = await llmHelper.generateSessionName(request.userRequest);

            // Generate branch name if this is a GitHub session
            if (request.github) {
              branchName = generateBranchName(sessionName, sessionId.split('-')[0]);
            }

            // Update metadata with session name
            metadata!.sessionName = sessionName;
            // Note: GitHub branchName will be added to metadata after repo is cloned

            // Send session name event
            sendEvent({
              type: 'session_name',
              sessionName,
              branchName,
              timestamp: new Date().toISOString()
            });

            logger.info('Generated session metadata', {
              component: 'Orchestrator',
              sessionId,
              sessionName,
              branchName
            });
          } catch (error) {
            logger.error('Failed to generate session name', error, {
              component: 'Orchestrator',
              sessionId
            });
            // Continue without session name - not critical
          }
        }
      }

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
          branchName: branchName, // Add generated branch name
          clonedPath: repoName
        };

        // Update workspace path to cloned repo
        workspacePath = pullResult.targetPath;

        // Save updated metadata
        this.sessionStorage.saveMetadata(sessionId, path.join(this.tmpDir, `session-${sessionId}`), metadata);

        sendEvent({
          type: 'github_pull_progress',
          data: {
            type: 'completed',
            message: pullResult.wasCloned ? 'Repository cloned successfully' : 'Repository updated successfully',
            targetPath: pullResult.targetPath
          },
          timestamp: new Date().toISOString()
        });

        logger.info('Repository cloned', {
          component: 'Orchestrator',
          sessionId,
          repoUrl: request.github.repoUrl,
          branch: pullResult.branch
        });

        // Create branch if branchName was generated
        if (branchName) {
          try {
            const gitHelper = new GitHelper(pullResult.targetPath);
            const branchExists = await gitHelper.branchExists(branchName);

            if (!branchExists) {
              await gitHelper.createBranch(branchName);

              sendEvent({
                type: 'branch_created',
                branchName,
                message: `Created and checked out branch: ${branchName}`,
                timestamp: new Date().toISOString()
              });

              logger.info('Created branch', {
                component: 'Orchestrator',
                sessionId,
                branchName
              });
            } else {
              logger.info('Branch already exists', {
                component: 'Orchestrator',
                sessionId,
                branchName
              });
            }
          } catch (error) {
            logger.error('Failed to create branch', error, {
              component: 'Orchestrator',
              sessionId,
              branchName
            });
            // Continue without branch creation - not critical
          }
        }
      } else if (metadata.github && isResuming) {
        // Resuming session with GitHub - workspace path should be repo directory
        workspacePath = path.join(this.tmpDir, `session-${sessionId}`, metadata.github.clonedPath);
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
        request.codingAssistantAuthentication,
        workspacePath,
        request.providerOptions
      );

      // Step 6: Execute provider and stream results
      await provider.execute(
        request.userRequest,
        {
          authentication: request.codingAssistantAuthentication,
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
            logger.info('Provider session initialized', {
              component: 'Orchestrator',
              sessionId,
              providerSessionId: newProviderSessionId
            });

            // Update metadata with provider session ID
            metadata!.providerSessionId = newProviderSessionId;
            this.sessionStorage.saveMetadata(
              sessionId,
              path.join(this.tmpDir, `session-${sessionId}`),
              metadata!
            );
          }

          // Forward provider events to SSE stream
          sendEvent({
            ...event,
            timestamp: new Date().toISOString()
          });
        }
      );

      // Step 6.5: Auto-commit changes (if enabled and GitHub session)
      const shouldAutoCommit = request.github && (request.autoCommit !== false); // Default true for GitHub repos

      if (shouldAutoCommit && metadata.github) {
        try {
          const repoPath = path.join(this.tmpDir, `session-${sessionId}`, metadata.github.clonedPath);
          const gitHelper = new GitHelper(repoPath);

          // Check if there are changes to commit
          const hasChanges = await gitHelper.hasChanges();

          if (hasChanges) {
            sendEvent({
              type: 'commit_progress',
              stage: 'analyzing',
              message: 'Analyzing changes for auto-commit...',
              timestamp: new Date().toISOString()
            });

            // Get git status and diff
            const gitStatus = await gitHelper.getStatus();
            const gitDiff = await gitHelper.getDiff();

            sendEvent({
              type: 'commit_progress',
              stage: 'generating_message',
              message: 'Generating commit message...',
              timestamp: new Date().toISOString()
            });

            // Generate commit message
            const apiKey = this.extractApiKey(request.codingAssistantAuthentication);
            if (apiKey) {
              const llmHelper = new LLMHelper(apiKey);
              const commitMessage = await llmHelper.generateCommitMessage(gitStatus, gitDiff);

              sendEvent({
                type: 'commit_progress',
                stage: 'committing',
                message: 'Creating commit...',
                commitMessage,
                timestamp: new Date().toISOString()
              });

              // Create commit
              const commitHash = await gitHelper.commitAll(commitMessage);

              sendEvent({
                type: 'commit_progress',
                stage: 'completed',
                message: 'Changes committed successfully',
                commitMessage,
                commitHash,
                timestamp: new Date().toISOString()
              });

              logger.info('Auto-commit completed', {
                component: 'Orchestrator',
                sessionId,
                commitHash,
                commitMessage
              });
            }
          } else {
            logger.info('No changes to auto-commit', {
              component: 'Orchestrator',
              sessionId
            });
          }
        } catch (error) {
          logger.error('Failed to auto-commit changes', error, {
            component: 'Orchestrator',
            sessionId
          });
          // Continue without auto-commit - not critical
          sendEvent({
            type: 'commit_progress',
            stage: 'completed',
            message: 'Auto-commit failed (non-critical)',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Step 7: Upload session to MinIO
      logger.info('Uploading session to storage', {
        component: 'Orchestrator',
        sessionId
      });

      await this.sessionStorage.uploadSession(sessionId, path.join(this.tmpDir, `session-${sessionId}`));

      // Step 8: Send completion event
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

      // Step 9: Cleanup local workspace
      try {
        fs.rmSync(path.join(this.tmpDir, `session-${sessionId}`), { recursive: true, force: true });
        logger.info('Local workspace cleaned up', {
          component: 'Orchestrator',
          sessionId
        });
      } catch (err) {
        logger.error('Failed to cleanup local workspace', err, {
          component: 'Orchestrator',
          sessionId
        });
      }

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

      // Try to upload session even on error (preserve state)
      try {
        if (workspacePath && fs.existsSync(path.join(this.tmpDir, `session-${sessionId}`))) {
          await this.sessionStorage.uploadSession(sessionId, path.join(this.tmpDir, `session-${sessionId}`));
        }
      } catch (uploadErr) {
        logger.error('Failed to upload session after error', uploadErr, {
          component: 'Orchestrator',
          sessionId
        });
      }

      // Cleanup local workspace
      try {
        if (fs.existsSync(path.join(this.tmpDir, `session-${sessionId}`))) {
          fs.rmSync(path.join(this.tmpDir, `session-${sessionId}`), { recursive: true, force: true });
        }
      } catch (cleanupErr) {
        logger.error('Failed to cleanup local workspace after error', cleanupErr, {
          component: 'Orchestrator',
          sessionId
        });
      }

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
        ).catch(err => logger.error('Failed to update error status in DB', err, {
          component: 'Orchestrator',
          sessionId
        }));
      }

      res.end();
      throw error; // Re-throw to trigger worker exit
    }
  }

  /**
   * Extract API key from authentication string
   * Handles both OAuth JSON format and plain API keys
   */
  private extractApiKey(authentication: string): string | null {
    try {
      const parsed = JSON.parse(authentication);

      // OAuth format: { claudeAiOauth: { accessToken: "..." } }
      if (parsed.claudeAiOauth?.accessToken) {
        return parsed.claudeAiOauth.accessToken;
      }

      // Plain API key in object: { apiKey: "..." }
      if (parsed.apiKey) {
        return parsed.apiKey;
      }

      return null;
    } catch {
      // If not JSON, might be plain API key
      if (authentication.startsWith('sk-ant-')) {
        return authentication;
      }
      return null;
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

    if (!request.codingAssistantAuthentication || request.codingAssistantAuthentication.trim() === '') {
      throw new Error('codingAssistantAuthentication is required');
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

  /**
   * List all sessions (from MinIO)
   */
  async listSessions(): Promise<string[]> {
    return await this.sessionStorage.listSessions();
  }

  /**
   * Delete a session (from MinIO)
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionStorage.deleteSession(sessionId);
  }
}
