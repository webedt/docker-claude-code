import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { ExecuteRequest, APIError } from './types';
import { Orchestrator } from './orchestrator';

const app = express();
const PORT = process.env.PORT || 5000;
const TMP_DIR = process.env.TMP_DIR || '/tmp';
const DB_BASE_URL = process.env.DB_BASE_URL;

// Default coding assistant credentials from environment (optional fallback)
const DEFAULT_CODING_ASSISTANT_PROVIDER = process.env.CODING_ASSISTANT_PROVIDER;
const DEFAULT_CODING_ASSISTANT_AUTHENTICATION = process.env.CODING_ASSISTANT_AUTHENTICATION;

// Default GitHub token from environment (optional fallback)
const DEFAULT_GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Worker state
let workerStatus: 'idle' | 'busy' = 'idle';

// Create orchestrator instance
const orchestrator = new Orchestrator(TMP_DIR, DB_BASE_URL);

// Initialize orchestrator (MinIO bucket setup)
orchestrator.initialize().catch(err => {
  console.error('[Server] Failed to initialize orchestrator:', err);
  process.exit(1);
});

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    tmpDir: TMP_DIR,
    workerStatus,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Status endpoint - returns whether worker is idle or busy
 */
app.get('/status', (req: Request, res: Response) => {
  res.json({
    status: workerStatus,
    timestamp: new Date().toISOString(),
  });
});

/**
 * List all sessions
 * Returns array of session IDs from MinIO
 */
app.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessionIds = await orchestrator.listSessions();

    res.json({
      count: sessionIds.length,
      sessions: sessionIds.map(id => ({ sessionId: id, storage: 'minio' }))
    });
  } catch (error) {
    console.error('[Sessions] Error listing sessions:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to list sessions'
    });
  }
});

/**
 * Delete a session
 * Removes session from MinIO storage
 */
app.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    await orchestrator.deleteSession(sessionId);

    res.json({
      sessionId,
      deleted: true
    });
  } catch (error) {
    console.error(`[Sessions] Error deleting session ${sessionId}:`, error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to delete session'
    });
  }
});

/**
 * Unified execute endpoint
 * Handles all coding assistant operations via JSON payload
 *
 * Request modes (implicit from payload):
 * 1. Simple: Just userRequest + provider + token
 * 2. GitHub: Include github object to clone/pull repo
 * 3. Resume: Include resumeSessionId to continue session
 * 4. Full: GitHub + database persistence
 */
app.post('/execute', async (req: Request, res: Response) => {
  // Check if worker is busy
  if (workerStatus === 'busy') {
    const error: APIError = {
      error: 'busy',
      message: 'Worker is currently processing another request',
      retryAfter: 5
    };
    res.status(429).json(error);
    return;
  }

  // Parse request
  const request: ExecuteRequest = req.body;

  // Basic validation
  if (!request.userRequest) {
    const error: APIError = {
      error: 'invalid_request',
      message: 'Missing required field: userRequest',
      field: 'userRequest'
    };
    res.status(400).json(error);
    return;
  }

  // Use environment variables as fallback for provider and authentication
  if (!request.codingAssistantProvider || request.codingAssistantProvider === 'FROM_ENV') {
    if (DEFAULT_CODING_ASSISTANT_PROVIDER) {
      request.codingAssistantProvider = DEFAULT_CODING_ASSISTANT_PROVIDER;
      console.log('[Server] Using CODING_ASSISTANT_PROVIDER from environment');
    } else {
      const error: APIError = {
        error: 'invalid_request',
        message: 'Missing required field: codingAssistantProvider (not in request or environment)',
        field: 'codingAssistantProvider'
      };
      res.status(400).json(error);
      return;
    }
  }

  if (!request.codingAssistantAuthentication || request.codingAssistantAuthentication === 'FROM_ENV') {
    if (DEFAULT_CODING_ASSISTANT_AUTHENTICATION) {
      request.codingAssistantAuthentication = DEFAULT_CODING_ASSISTANT_AUTHENTICATION;
      console.log('[Server] Using CODING_ASSISTANT_AUTHENTICATION from environment');
    } else {
      const error: APIError = {
        error: 'invalid_request',
        message: 'Missing required field: codingAssistantAuthentication (not in request or environment)',
        field: 'codingAssistantAuthentication'
      };
      res.status(400).json(error);
      return;
    }
  }

  // Use environment variable as fallback for GitHub access token
  if (request.github && (!request.github.accessToken || request.github.accessToken === 'FROM_ENV')) {
    if (DEFAULT_GITHUB_ACCESS_TOKEN) {
      request.github.accessToken = DEFAULT_GITHUB_ACCESS_TOKEN;
      console.log('[Server] Using GITHUB_ACCESS_TOKEN from environment');
    }
  }

  // Set worker to busy
  workerStatus = 'busy';
  console.log(`[Worker] Status: busy - Starting execution`);
  console.log(`[Worker] Provider: ${request.codingAssistantProvider}`);
  console.log(`[Worker] Request: ${request.userRequest.substring(0, 100)}...`);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // Execute the orchestrated workflow
    await orchestrator.execute(request, res);

    console.log('[Worker] Execution completed successfully');

    // Exit process after successful completion (ephemeral container model)
    console.log('[Worker] Exiting process in 1 second...');
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('[Worker] Execution failed:', error);

    // Exit process after error (ephemeral container model)
    console.log('[Worker] Exiting process in 1 second...');
    setTimeout(() => process.exit(1), 1000);
  }
});

/**
 * Catch-all for undefined routes
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: `Endpoint not found: ${req.method} ${req.path}`,
    availableEndpoints: [
      'GET  /health',
      'GET  /status',
      'GET  /sessions',
      'GET  /sessions/:sessionId',
      'GET  /sessions/:sessionId/stream',
      'POST /execute'
    ]
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Unified Coding Assistant Worker (MinIO Storage)');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`📁 Temp directory: ${TMP_DIR}`);
  console.log(`🗄️  Storage: MinIO (${process.env.MINIO_ENDPOINT || 'Not configured'})`);
  console.log(`💾 Database URL: ${DB_BASE_URL || 'Not configured'}`);
  console.log(`📊 Status: ${workerStatus}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET    /health                    - Health check');
  console.log('  GET    /status                    - Worker status (idle/busy)');
  console.log('  GET    /sessions                  - List all sessions (from MinIO)');
  console.log('  DELETE /sessions/:id              - Delete a session');
  console.log('  POST   /execute                   - Execute coding assistant request');
  console.log('');
  console.log('Supported providers:');
  console.log('  - claude-code');
  console.log('  - codex / cursor');
  console.log('');
  console.log('Worker behavior:');
  console.log('  - Ephemeral: exits after completing each job');
  console.log('  - Returns 429 if busy (load balancer will retry)');
  console.log('  - Sessions stored in MinIO for complete isolation');
  console.log('  - Downloads session at start, uploads at end');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT received, shutting down gracefully...');
  process.exit(0);
});
