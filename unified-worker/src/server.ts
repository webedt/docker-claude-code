import express, { Request, Response } from 'express';
import cors from 'cors';
import { ExecuteRequest, APIError } from './types';
import { Orchestrator } from './orchestrator';

const app = express();
const PORT = process.env.PORT || 5000;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const DB_BASE_URL = process.env.DB_BASE_URL;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Worker state
let workerStatus: 'idle' | 'busy' = 'idle';

// Create orchestrator instance
const orchestrator = new Orchestrator(WORKSPACE_DIR, DB_BASE_URL);

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    workspace: WORKSPACE_DIR,
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

  if (!request.codingAssistantProvider) {
    const error: APIError = {
      error: 'invalid_request',
      message: 'Missing required field: codingAssistantProvider',
      field: 'codingAssistantProvider'
    };
    res.status(400).json(error);
    return;
  }

  if (!request.codingAssistantAccessToken) {
    const error: APIError = {
      error: 'invalid_request',
      message: 'Missing required field: codingAssistantAccessToken',
      field: 'codingAssistantAccessToken'
    };
    res.status(400).json(error);
    return;
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
      'POST /execute'
    ]
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Unified Coding Assistant Worker');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`📁 Workspace directory: ${WORKSPACE_DIR}`);
  console.log(`💾 Database URL: ${DB_BASE_URL || 'Not configured'}`);
  console.log(`📊 Status: ${workerStatus}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /health  - Health check');
  console.log('  GET  /status  - Worker status (idle/busy)');
  console.log('  POST /execute - Execute coding assistant request');
  console.log('');
  console.log('Supported providers:');
  console.log('  - claude-code');
  console.log('');
  console.log('Worker behavior:');
  console.log('  - Ephemeral: exits after completing each job');
  console.log('  - Returns 429 if busy (load balancer will retry)');
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
