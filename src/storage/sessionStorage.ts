import { Client as MinioClient } from 'minio';
import * as tar from 'tar';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { SessionMetadata, SSEEvent } from '../types';

/**
 * Session storage using MinIO for complete session isolation
 * Each session is stored as a compressed tarball in MinIO
 */
export class SessionStorage {
  private minio?: MinioClient;
  private bucket?: string;
  private enabled: boolean;

  constructor() {
    // Check if MinIO is configured
    const endpoint = process.env.MINIO_ENDPOINT;
    this.enabled = !!endpoint;

    if (!this.enabled) {
      logger.info('MinIO not configured, session storage disabled', {
        component: 'SessionStorage'
      });
      return;
    }

    this.bucket = process.env.MINIO_BUCKET || 'sessions';

    this.minio = new MinioClient({
      endPoint: endpoint!,
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
    });

    logger.info('MinIO session storage initialized', {
      component: 'SessionStorage',
      endpoint,
      bucket: this.bucket
    });
  }

  /**
   * Initialize MinIO bucket (call on startup)
   */
  async initialize(): Promise<void> {
    if (!this.enabled || !this.minio || !this.bucket) return;

    try {
      const exists = await this.minio.bucketExists(this.bucket);
      if (!exists) {
        await this.minio.makeBucket(this.bucket);
        logger.info('Created MinIO bucket', {
          component: 'SessionStorage',
          bucket: this.bucket
        });
      }
    } catch (error) {
      logger.error('Failed to initialize MinIO bucket', error, {
        component: 'SessionStorage'
      });
      throw error;
    }
  }

  /**
   * Download session from MinIO to local workspace
   * Restores workspace, ~/.claude, and ~/.codex for complete session state
   * Creates empty workspace if session doesn't exist
   */
  async downloadSession(sessionId: string, localPath: string): Promise<boolean> {
    if (!this.enabled || !this.minio || !this.bucket) {
      // Without MinIO, just create empty directory
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
      }
      return false;
    }

    const objectName = `${sessionId}/session.tar.gz`;
    const tarPath = `${localPath}-complete.tar.gz`;
    const tmpExtractDir = `${localPath}-extract`;
    const homeDir = process.env.HOME || '/home/worker';

    try {
      logger.info('Downloading session from MinIO', {
        component: 'SessionStorage',
        sessionId,
        objectName
      });

      // Download tarball
      await this.minio.fGetObject(this.bucket, objectName, tarPath);

      // Create temporary extraction directory
      fs.mkdirSync(tmpExtractDir, { recursive: true });

      // Extract tarball to temporary directory
      await tar.extract({
        file: tarPath,
        cwd: tmpExtractDir
      });

      // Move workspace contents to final location
      const workspaceExtractPath = path.join(tmpExtractDir, 'workspace');
      if (fs.existsSync(workspaceExtractPath)) {
        fs.mkdirSync(localPath, { recursive: true });
        await this.copyDirectory(workspaceExtractPath, localPath);
      } else {
        // Fallback: if workspace wasn't in a subdirectory
        fs.mkdirSync(localPath, { recursive: true });
      }

      // Restore ~/.claude if it exists in the archive
      const claudeExtractPath = path.join(tmpExtractDir, '.claude');
      if (fs.existsSync(claudeExtractPath)) {
        const claudeDestPath = path.join(homeDir, '.claude');
        // Remove existing ~/.claude to avoid conflicts
        if (fs.existsSync(claudeDestPath)) {
          fs.rmSync(claudeDestPath, { recursive: true, force: true });
        }
        await this.copyDirectory(claudeExtractPath, claudeDestPath);
        logger.info('Restored ~/.claude from session', {
          component: 'SessionStorage',
          sessionId
        });
      }

      // Restore ~/.codex if it exists in the archive
      const codexExtractPath = path.join(tmpExtractDir, '.codex');
      if (fs.existsSync(codexExtractPath)) {
        const codexDestPath = path.join(homeDir, '.codex');
        // Remove existing ~/.codex to avoid conflicts
        if (fs.existsSync(codexDestPath)) {
          fs.rmSync(codexDestPath, { recursive: true, force: true });
        }
        await this.copyDirectory(codexExtractPath, codexDestPath);
        logger.info('Restored ~/.codex from session', {
          component: 'SessionStorage',
          sessionId
        });
      }

      // Cleanup
      fs.unlinkSync(tarPath);
      fs.rmSync(tmpExtractDir, { recursive: true, force: true });

      logger.info('Session downloaded successfully', {
        component: 'SessionStorage',
        sessionId,
        localPath
      });

      return true;
    } catch (err: any) {
      if (err.code === 'NotFound') {
        // New session - create empty workspace
        logger.info('Session not found in MinIO, creating new workspace', {
          component: 'SessionStorage',
          sessionId
        });
        fs.mkdirSync(localPath, { recursive: true });
        return false;
      } else {
        logger.error('Failed to download session', err, {
          component: 'SessionStorage',
          sessionId
        });
        throw err;
      }
    }
  }

  /**
   * Upload session from local workspace to MinIO
   * Includes workspace, ~/.claude, and ~/.codex for complete session state
   */
  async uploadSession(sessionId: string, localPath: string): Promise<void> {
    if (!this.enabled || !this.minio || !this.bucket) {
      logger.info('MinIO disabled, skipping upload', {
        component: 'SessionStorage',
        sessionId
      });
      return;
    }

    const objectName = `${sessionId}/session.tar.gz`;
    const tarPath = `${localPath}-complete.tar.gz`;
    const homeDir = process.env.HOME || '/home/worker';
    const claudeDir = path.join(homeDir, '.claude');
    const codexDir = path.join(homeDir, '.codex');

    try {
      logger.info('Uploading session to MinIO', {
        component: 'SessionStorage',
        sessionId,
        localPath,
        claudeDir,
        codexDir
      });

      // Create a temporary directory to organize files for the tarball
      const tmpPackageDir = `${localPath}-package`;
      fs.mkdirSync(tmpPackageDir, { recursive: true });

      // Copy workspace to package directory
      const workspaceDestDir = path.join(tmpPackageDir, 'workspace');
      await this.copyDirectory(localPath, workspaceDestDir);

      // Copy ~/.claude to package directory (if it exists)
      if (fs.existsSync(claudeDir)) {
        const claudeDestDir = path.join(tmpPackageDir, '.claude');
        await this.copyDirectory(claudeDir, claudeDestDir);
      }

      // Copy ~/.codex to package directory (if it exists)
      if (fs.existsSync(codexDir)) {
        const codexDestDir = path.join(tmpPackageDir, '.codex');
        await this.copyDirectory(codexDir, codexDestDir);
      }

      // Create tarball from package directory
      await tar.create(
        {
          gzip: true,
          file: tarPath,
          cwd: tmpPackageDir
        },
        ['.']
      );

      // Get file size for logging
      const stats = fs.statSync(tarPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      // Upload to MinIO
      await this.minio.fPutObject(this.bucket, objectName, tarPath);

      // Cleanup
      fs.unlinkSync(tarPath);
      fs.rmSync(tmpPackageDir, { recursive: true, force: true });

      logger.info('Session uploaded successfully', {
        component: 'SessionStorage',
        sessionId,
        sizeMB
      });
    } catch (error) {
      logger.error('Failed to upload session', error, {
        component: 'SessionStorage',
        sessionId
      });
      throw error;
    }
  }

  /**
   * Helper to recursively copy directory
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * List all sessions in MinIO
   */
  async listSessions(): Promise<string[]> {
    if (!this.enabled || !this.minio || !this.bucket) {
      return [];
    }

    try {
      const stream = this.minio.listObjects(this.bucket, '', true);
      const sessions = new Set<string>();

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          // Extract session ID from path: {sessionId}/workspace.tar.gz
          if (obj.name) {
            const sessionId = obj.name.split('/')[0];
            sessions.add(sessionId);
          }
        });
        stream.on('end', () => resolve(Array.from(sessions)));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to list sessions', error, {
        component: 'SessionStorage'
      });
      throw error;
    }
  }

  /**
   * Check if session exists in MinIO
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    if (!this.enabled || !this.minio || !this.bucket) {
      return false;
    }

    try {
      const objectName = `${sessionId}/workspace.tar.gz`;
      await this.minio.statObject(this.bucket, objectName);
      return true;
    } catch (err: any) {
      if (err.code === 'NotFound') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Delete session from MinIO
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.enabled || !this.minio || !this.bucket) {
      return;
    }

    try {
      const objectName = `${sessionId}/workspace.tar.gz`;
      await this.minio.removeObject(this.bucket, objectName);

      logger.info('Session deleted from MinIO', {
        component: 'SessionStorage',
        sessionId
      });
    } catch (error) {
      logger.error('Failed to delete session', error, {
        component: 'SessionStorage',
        sessionId
      });
      throw error;
    }
  }

  /**
   * Get session metadata from the session workspace
   * Note: Metadata is stored within the session tarball
   */
  async getMetadata(sessionId: string, localPath: string): Promise<SessionMetadata | null> {
    const metadataPath = path.join(localPath, '.session-metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content) as SessionMetadata;
    } catch (error) {
      logger.error('Failed to read metadata', error, {
        component: 'SessionStorage',
        sessionId
      });
      return null;
    }
  }

  /**
   * Save session metadata to the session workspace
   */
  saveMetadata(sessionId: string, localPath: string, metadata: SessionMetadata): void {
    const metadataPath = path.join(localPath, '.session-metadata.json');

    try {
      metadata.updatedAt = new Date().toISOString();
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to save metadata', error, {
        component: 'SessionStorage',
        sessionId
      });
      throw error;
    }
  }

  /**
   * Get stream events from /response directory
   */
  getStreamEvents(sessionId: string, localPath: string): SSEEvent[] {
    // Read stream events from /response directory
    const responseDir = path.join(localPath, 'response');
    const eventsPath = path.join(responseDir, 'stream-events.jsonl');

    if (!fs.existsSync(eventsPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(eventsPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      return lines.map(line => JSON.parse(line));
    } catch (error) {
      logger.error('Failed to read stream events', error, {
        component: 'SessionStorage',
        sessionId
      });
      return [];
    }
  }

  /**
   * Append stream event to /response directory (separate from workspace)
   */
  appendStreamEvent(sessionId: string, localPath: string, event: SSEEvent): void {
    // Store stream events in /response directory, not in the workspace
    const responseDir = path.join(localPath, 'response');
    const eventsPath = path.join(responseDir, 'stream-events.jsonl');

    try {
      // Create response directory if it doesn't exist
      if (!fs.existsSync(responseDir)) {
        fs.mkdirSync(responseDir, { recursive: true });
      }

      const eventLine = JSON.stringify(event) + '\n';
      fs.appendFileSync(eventsPath, eventLine, 'utf-8');
    } catch (error) {
      logger.error('Failed to append stream event', error, {
        component: 'SessionStorage',
        sessionId
      });
    }
  }
}
