import express, { Request, Response } from 'express';
import cors from 'cors';
import simpleGit from 'simple-git';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 4000;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

// Middleware
app.use(cors());
app.use(express.json());

// Track server status (idle/busy)
let serverStatus: 'idle' | 'busy' = 'idle';

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    workspace: WORKSPACE_DIR,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Status endpoint - returns whether server is idle or busy
 */
app.get('/status', (req: Request, res: Response) => {
  res.json({
    status: serverStatus,
    timestamp: new Date().toISOString(),
  });
});

/**
 * List all repositories in workspace
 */
app.get('/api/repos', (req: Request, res: Response) => {
  try {
    const repos = fs.readdirSync(WORKSPACE_DIR)
      .filter(name => {
        const repoPath = path.join(WORKSPACE_DIR, name);
        const gitPath = path.join(repoPath, '.git');
        return fs.existsSync(gitPath);
      })
      .map(name => {
        const repoPath = path.join(WORKSPACE_DIR, name);
        const stats = fs.statSync(repoPath);
        return {
          name,
          path: repoPath,
          modified: stats.mtime,
        };
      });

    res.json({ repos, count: repos.length });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list repositories',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Clone/Pull a repository endpoint (SSE streaming)
 * For ephemeral containers: Sets status to busy, executes job, then exits process
 */
app.post('/api/pull', async (req: Request, res: Response) => {
  const { repoUrl, branch, directory } = req.body;

  if (!repoUrl) {
    res.status(400).json({ error: 'repoUrl is required' });
    return;
  }

  // Set status to busy
  serverStatus = 'busy';

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const jobId = randomUUID();

  // Determine target directory
  const repoName = directory || repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
  const targetPath = path.join(WORKSPACE_DIR, repoName);

  try {
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      jobId,
      repoUrl,
      targetPath,
    })}\n\n`);

    const git = simpleGit();

    // Check if directory already exists
    if (fs.existsSync(targetPath)) {
      // Directory exists, try to pull
      res.write(`data: ${JSON.stringify({
        type: 'message',
        message: `Repository directory exists, pulling latest changes...`,
        timestamp: new Date().toISOString(),
      })}\n\n`);

      const repoGit = simpleGit(targetPath);

      // Check if it's a git repository
      const isRepo = await repoGit.checkIsRepo();
      if (!isRepo) {
        throw new Error(`Directory ${repoName} exists but is not a git repository`);
      }

      // Fetch and pull
      await repoGit.fetch();
      const pullResult = await repoGit.pull(branch || undefined);

      res.write(`data: ${JSON.stringify({
        type: 'message',
        message: `Pull completed: ${pullResult.summary.changes} changes, ${pullResult.summary.insertions} insertions, ${pullResult.summary.deletions} deletions`,
        details: pullResult,
        timestamp: new Date().toISOString(),
      })}\n\n`);

    } else {
      // Directory doesn't exist, clone
      res.write(`data: ${JSON.stringify({
        type: 'message',
        message: `Cloning repository into ${repoName}...`,
        timestamp: new Date().toISOString(),
      })}\n\n`);

      const cloneOptions = branch ? ['--branch', branch] : [];
      await git.clone(repoUrl, targetPath, cloneOptions);

      res.write(`data: ${JSON.stringify({
        type: 'message',
        message: `Repository cloned successfully`,
        timestamp: new Date().toISOString(),
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({
      type: 'completed',
      jobId,
      targetPath,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();

    // Exit process after successful completion (for ephemeral container model)
    console.log('Job completed successfully. Exiting process...');
    setTimeout(() => process.exit(0), 1000);

  } catch (error) {
    console.error('Error during git operation:', error);

    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();

    // Exit process after error (for ephemeral container model)
    console.log('Job failed. Exiting process...');
    setTimeout(() => process.exit(1), 1000);
  }
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`🚀 GitHub Pull API Server running on port ${PORT}`);
  console.log(`📁 Workspace directory: ${WORKSPACE_DIR}`);
  console.log(`📊 Status: ${serverStatus}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /status`);
  console.log(`  GET  /api/repos`);
  console.log(`  POST /api/pull (exits process when complete)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
