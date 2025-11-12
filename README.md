# Claude Code SSE Streaming API Server

A TypeScript-based SSE (Server-Sent Events) streaming API server that provides a REST API interface to Claude Code using the Anthropic Agent SDK.

## Features

- 🌊 **SSE Streaming**: Real-time streaming of Claude Code responses
- 🔐 **Session Management**: Create and manage multiple agent sessions
- 🐳 **Dockerized**: Fully containerized with all dependencies
- 📁 **Workspace Support**: Configurable workspace directories
- 🔌 **REST API**: Simple HTTP endpoints for integration
- 🔄 **Real-time Events**: Stream messages, tool usage, and errors

## Prerequisites

- Docker (for containerized deployment)
- Node.js 20+ (for local development)
- Anthropic API key

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `CLAUDE_CODE_AUTH_JSON` | Optional | JSON string for Claude Code authentication config |
| `PORT` | No | Server port (default: 3000) |
| `WORKSPACE_DIR` | No | Workspace directory (default: /workspace) |

## Quick Start with Docker

### 1. Build the Docker image

```bash
docker build -t claude-code-sse-api .
```

### 2. Run the container

```bash
docker run -d \
  --name claude-api \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY="your-api-key-here" \
  -e CLAUDE_CODE_AUTH_JSON='{"session_key": "your-session-key"}' \
  -v $(pwd)/workspace:/workspace \
  claude-code-sse-api
```

### 3. Test the health endpoint

```bash
curl http://localhost:3000/health
```

## API Endpoints

### Health Check
```http
GET /health
```

Returns server status and configuration.

**Response:**
```json
{
  "status": "ok",
  "workspace": "/workspace",
  "timestamp": "2025-11-12T03:00:00.000Z"
}
```

---

### Create Session
```http
POST /api/sessions
Content-Type: application/json

{
  "workspace": "/custom/workspace" // optional
}
```

Creates a new agent session with optional custom workspace.

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "workspace": "/workspace",
  "created": "2025-11-12T03:00:00.000Z"
}
```

---

### List Sessions
```http
GET /api/sessions
```

Lists all active sessions.

**Response:**
```json
{
  "sessions": [
    { "sessionId": "550e8400-e29b-41d4-a716-446655440000" }
  ],
  "count": 1
}
```

---

### Stream with Session
```http
POST /api/stream/:sessionId
Content-Type: application/json

{
  "prompt": "Create a hello world function in Python"
}
```

Streams agent responses using SSE.

**SSE Event Types:**
- `connected`: Initial connection confirmation
- `message`: Agent messages and responses
- `tool_use`: Tool execution information
- `error`: Error messages
- `completed`: Final completion with results

**Example SSE Stream:**
```
data: {"type":"connected","sessionId":"550e8400..."}

data: {"type":"message","content":"I'll create a Python function...","timestamp":"2025-11-12T03:00:00.000Z"}

data: {"type":"tool_use","tool":{"name":"Write","input":{...}},"timestamp":"2025-11-12T03:00:00.000Z"}

data: {"type":"completed","result":{...},"timestamp":"2025-11-12T03:00:00.000Z"}
```

---

### One-off Execution
```http
POST /api/execute
Content-Type: application/json

{
  "prompt": "List files in the workspace",
  "workspace": "/custom/workspace" // optional
}
```

Executes a prompt without requiring a session. Creates a temporary session for the request.

**Response:** Same SSE stream format as `/api/stream/:sessionId`

---

### Delete Session
```http
DELETE /api/sessions/:sessionId
```

Deletes an active session and frees resources.

**Response:**
```json
{
  "message": "Session deleted",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Usage Examples

### JavaScript/TypeScript Client

```typescript
// Create a session
const response = await fetch('http://localhost:3000/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});
const { sessionId } = await response.json();

// Stream responses
const streamResponse = await fetch(`http://localhost:3000/api/stream/${sessionId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Create a TypeScript interface for a User'
  }),
});

const reader = streamResponse.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      console.log('Event:', data.type, data);
    }
  }
}
```

### Python Client

```python
import requests
import json

# Create a session
response = requests.post('http://localhost:3000/api/sessions')
session_id = response.json()['sessionId']

# Stream responses
response = requests.post(
    f'http://localhost:3000/api/stream/{session_id}',
    json={'prompt': 'Create a Python class for a User'},
    stream=True
)

for line in response.iter_lines():
    if line.startswith(b'data: '):
        data = json.loads(line[6:])
        print(f"Event: {data['type']}", data)
```

### cURL

```bash
# Create session
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/sessions | jq -r '.sessionId')

# Stream with the session
curl -X POST "http://localhost:3000/api/stream/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "List files in the current directory"}' \
  --no-buffer

# Or use one-off execution
curl -X POST "http://localhost:3000/api/execute" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is in the workspace?"}' \
  --no-buffer
```

## Local Development

### Install dependencies
```bash
npm install
```

### Build TypeScript
```bash
npm run build
```

### Run in development mode
```bash
npm run dev
```

### Run in production mode
```bash
npm start
```

## Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  claude-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_CODE_AUTH_JSON=${CLAUDE_CODE_AUTH_JSON}
      - PORT=3000
      - WORKSPACE_DIR=/workspace
    volumes:
      - ./workspace:/workspace
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

## Project Structure

```
.
├── src/
│   └── server.ts          # Main SSE API server
├── Dockerfile             # Docker configuration
├── entrypoint.sh         # Container entrypoint script
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Troubleshooting

### Container fails to start

Check the logs:
```bash
docker logs claude-api
```

Common issues:
- Missing `ANTHROPIC_API_KEY` environment variable
- Invalid `CLAUDE_CODE_AUTH_JSON` format (must be valid JSON)
- Port 3000 already in use

### SSE connection drops

- Check network timeouts (configure nginx/load balancer for long-lived connections)
- Ensure `X-Accel-Buffering: no` header is respected
- Verify firewall allows persistent connections

### Agent execution errors

- Verify the workspace directory has proper permissions
- Check that the workspace path exists or is properly mounted
- Review agent logs in the SSE stream for detailed error messages

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
