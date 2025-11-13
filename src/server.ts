import express, { Request, Response } from 'express';
import cors from 'cors';
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

// Middleware
app.use(cors());
app.use(express.json());

// Store active session IDs (for tracking purposes)
const activeSessions = new Set<string>();

// Track server status (idle/busy)
let serverStatus: 'idle' | 'busy' = 'idle';

/**
 * Create options for Claude Agent query
 * Authentication is handled via .claude/.credentials.json set up by CLAUDE_CODE_CREDENTIALS_JSON
 */
function createQueryOptions(customWorkspace?: string, skipPermissions?: boolean, resumeSessionId?: string): Options {
  const options: Options = {
    model: 'claude-sonnet-4-5-20250929',
    cwd: customWorkspace || WORKSPACE_DIR,
    systemPrompt: `You are Claude Code, running in a containerized environment. The working directory is ${customWorkspace || WORKSPACE_DIR}.`,
    allowDangerouslySkipPermissions: skipPermissions ?? true,
    permissionMode: (skipPermissions ?? true) ? 'bypassPermissions' : 'default',
  };

  // Add resume option if session ID is provided
  if (resumeSessionId) {
    options.resume = resumeSessionId;
  }

  return options;
}

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
 * Create a new agent session
 */
app.post('/api/sessions', async (req: Request, res: Response) => {
  try {
    const sessionId = randomUUID();
    const { workspace } = req.body;

    activeSessions.add(sessionId);

    res.json({
      sessionId,
      workspace: workspace || WORKSPACE_DIR,
      created: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      error: 'Failed to create session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Delete a session
 */
app.delete('/api/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    res.json({ message: 'Session deleted', sessionId });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

/**
 * List active sessions
 */
app.get('/api/sessions', (req: Request, res: Response) => {
  const sessions = Array.from(activeSessions.keys()).map(sessionId => ({
    sessionId,
  }));

  res.json({ sessions, count: sessions.length });
});

/**
 * SSE streaming endpoint for agent interactions
 * Supports resuming from a previous session by providing resumeSessionId
 */
app.post('/api/stream/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { prompt, workspace, dangerouslySkipPermissions, resumeSessionId } = req.body;

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  if (!activeSessions.has(sessionId)) {
    res.status(404).json({ error: 'Session not found. Create a session first.' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    sessionId,
    resuming: !!resumeSessionId,
    resumedFrom: resumeSessionId || undefined
  })}\n\n`);

  try {
    const options = createQueryOptions(workspace, dangerouslySkipPermissions, resumeSessionId);
    const queryStream = query({ prompt, options });

    // Stream messages from the query
    for await (const message of queryStream) {
      res.write(`data: ${JSON.stringify({
        type: 'message',
        content: message,
        timestamp: new Date().toISOString(),
      })}\n\n`);
    }

    // Send completion message
    res.write(`data: ${JSON.stringify({
      type: 'completed',
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();
  } catch (error) {
    console.error('Error during agent execution:', error);

    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();
  }
});

/**
 * One-off execution endpoint (no session required)
 * For ephemeral containers: Sets status to busy, executes job, then exits process
 * Supports resuming from a previous session by providing resumeSessionId
 */
app.post('/api/execute', async (req: Request, res: Response) => {
  const { prompt, workspace, dangerouslySkipPermissions, resumeSessionId } = req.body;

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  // Set status to busy
  serverStatus = 'busy';

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const tempSessionId = randomUUID();

  try {
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      sessionId: tempSessionId,
      resuming: !!resumeSessionId,
      resumedFrom: resumeSessionId || undefined
    })}\n\n`);

    const options = createQueryOptions(workspace, dangerouslySkipPermissions, resumeSessionId);
    const queryStream = query({ prompt, options });

    // Stream messages from the query
    for await (const message of queryStream) {
      res.write(`data: ${JSON.stringify({
        type: 'message',
        content: message,
        timestamp: new Date().toISOString(),
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({
      type: 'completed',
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();

    // Exit process after successful completion (for ephemeral container model)
    console.log('Job completed successfully. Exiting process...');
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('Error during execution:', error);

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
  console.log(`🚀 Claude Code SSE API Server running on port ${PORT}`);
  console.log(`📁 Workspace directory: ${WORKSPACE_DIR}`);
  console.log(`📊 Status: ${serverStatus}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /status`);
  console.log(`  POST /api/sessions`);
  console.log(`  GET  /api/sessions`);
  console.log(`  POST /api/stream/:sessionId`);
  console.log(`  POST /api/execute (exits process when complete)`);
  console.log(`  DELETE /api/sessions/:sessionId`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  activeSessions.clear();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  activeSessions.clear();
  process.exit(0);
});
