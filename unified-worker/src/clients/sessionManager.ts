import * as fs from 'fs';
import * as path from 'path';
import { SessionMetadata } from '../types';

/**
 * Manages session workspaces and metadata
 * Each session gets its own directory: /workspace/session-{sessionId}/
 */
export class SessionManager {
  private workspaceRoot: string;
  private metadataFilename = '.session-metadata.json';

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Get the workspace directory for a session
   */
  getSessionWorkspace(sessionId: string): string {
    return path.join(this.workspaceRoot, `session-${sessionId}`);
  }

  /**
   * Create a new session workspace
   */
  createSessionWorkspace(sessionId: string): string {
    const sessionPath = this.getSessionWorkspace(sessionId);

    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    return sessionPath;
  }

  /**
   * Check if a session workspace exists
   */
  sessionExists(sessionId: string): boolean {
    const sessionPath = this.getSessionWorkspace(sessionId);
    return fs.existsSync(sessionPath);
  }

  /**
   * Save session metadata to the workspace
   */
  saveMetadata(sessionId: string, metadata: SessionMetadata): void {
    const sessionPath = this.getSessionWorkspace(sessionId);
    const metadataPath = path.join(sessionPath, this.metadataFilename);

    // Update timestamp
    metadata.updatedAt = new Date().toISOString();

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Load session metadata from the workspace
   */
  loadMetadata(sessionId: string): SessionMetadata | null {
    const sessionPath = this.getSessionWorkspace(sessionId);
    const metadataPath = path.join(sessionPath, this.metadataFilename);

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content) as SessionMetadata;
    } catch (error) {
      console.error(`[SessionManager] Failed to load metadata for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Create initial session metadata
   */
  createMetadata(
    sessionId: string,
    provider: string,
    github?: {
      repoUrl: string;
      branch: string;
      clonedPath: string;
    }
  ): SessionMetadata {
    const now = new Date().toISOString();

    return {
      sessionId,
      provider,
      createdAt: now,
      updatedAt: now,
      github
    };
  }

  /**
   * Update provider session ID in metadata
   */
  updateProviderSessionId(sessionId: string, providerSessionId: string): void {
    const metadata = this.loadMetadata(sessionId);
    if (metadata) {
      metadata.providerSessionId = providerSessionId;
      this.saveMetadata(sessionId, metadata);
    }
  }

  /**
   * Get the workspace path for code execution
   * If GitHub repo was cloned, return that path
   * Otherwise return session root
   */
  getExecutionWorkspace(sessionId: string): string {
    const metadata = this.loadMetadata(sessionId);
    const sessionPath = this.getSessionWorkspace(sessionId);

    if (metadata?.github?.clonedPath) {
      return path.join(sessionPath, metadata.github.clonedPath);
    }

    return sessionPath;
  }

  /**
   * List all sessions
   */
  listSessions(): string[] {
    if (!fs.existsSync(this.workspaceRoot)) {
      return [];
    }

    const entries = fs.readdirSync(this.workspaceRoot, { withFileTypes: true });

    return entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('session-'))
      .map(entry => entry.name.replace('session-', ''));
  }

  /**
   * Delete a session workspace
   */
  deleteSession(sessionId: string): void {
    const sessionPath = this.getSessionWorkspace(sessionId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  }
}
