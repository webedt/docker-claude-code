import express, { Request, Response } from 'express';
import cors from 'cors';
import { Agent, AgentOptions } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

// Middleware
app.use(cors());
app.use(express.json());

// Store active sessions
const activeSessions = new Map<string, Agent>();

/**
 * Initialize Claude Agent with workspace configuration
 * Authentication is handled via .claude/config.json set up by CLAUDE_CODE_CONFIG_JSON
 */
function createAgent(sessionId: string, customWorkspace?: string): Agent {
  const agentOptions: AgentOptions = {
    model: 'claude-sonnet-4-5-20250929',
    workingDirectory: customWorkspace || WORKSPACE_DIR,
    systemPrompt: `You are Claude Code, running in a containerized environment. The working directory is ${customWorkspace || WORKSPACE_DIR}.`,
  };

  return new Agent(agentOptions);
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
 * Create a new agent session
 */
app.post('/api/sessions', async (req: Request, res: Response) => {
  try {
    const sessionId = randomUUID();
    const { workspace } = req.body;

    const agent = createAgent(sessionId, workspace);
    activeSessions.set(sessionId, agent);

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
 */
app.post('/api/stream/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { prompt } = req.body;

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  const agent = activeSessions.get(sessionId);

  if (!agent) {
    res.status(404).json({ error: 'Session not found. Create a session first.' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  try {
    // Run the agent with the prompt
    const result = await agent.run(prompt, {
      onMessage: (message) => {
        // Stream each message to the client
        res.write(`data: ${JSON.stringify({
          type: 'message',
          content: message,
          timestamp: new Date().toISOString(),
        })}\n\n`);
      },
      onToolUse: (toolUse) => {
        // Stream tool usage information
        res.write(`data: ${JSON.stringify({
          type: 'tool_use',
          tool: toolUse,
          timestamp: new Date().toISOString(),
        })}\n\n`);
      },
      onError: (error) => {
        // Stream error information
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        })}\n\n`);
      },
    });

    // Send completion message with final result
    res.write(`data: ${JSON.stringify({
      type: 'completed',
      result,
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
 */
app.post('/api/execute', async (req: Request, res: Response) => {
  const { prompt, workspace } = req.body;

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const tempSessionId = randomUUID();

  try {
    const agent = createAgent(tempSessionId, workspace);

    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId: tempSessionId })}\n\n`);

    const result = await agent.run(prompt, {
      onMessage: (message) => {
        res.write(`data: ${JSON.stringify({
          type: 'message',
          content: message,
          timestamp: new Date().toISOString(),
        })}\n\n`);
      },
      onToolUse: (toolUse) => {
        res.write(`data: ${JSON.stringify({
          type: 'tool_use',
          tool: toolUse,
          timestamp: new Date().toISOString(),
        })}\n\n`);
      },
      onError: (error) => {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        })}\n\n`);
      },
    });

    res.write(`data: ${JSON.stringify({
      type: 'completed',
      result,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();
  } catch (error) {
    console.error('Error during execution:', error);

    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();
  }
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`🚀 Claude Code SSE API Server running on port ${PORT}`);
  console.log(`📁 Workspace directory: ${WORKSPACE_DIR}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/sessions`);
  console.log(`  GET  /api/sessions`);
  console.log(`  POST /api/stream/:sessionId`);
  console.log(`  POST /api/execute`);
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
