# Unified Coding Assistant Worker

A unified, provider-agnostic API for executing coding assistant requests with Docker Swarm orchestration.

## Features

- **Multi-Provider Support**: Claude Code, Cursor, Copilot, and more (extensible)
- **GitHub Integration**: Automatically clone/pull repositories
- **Session Management**: Resume previous sessions
- **Database Persistence**: Optional streaming chunk persistence
- **Ephemeral Workers**: Exit after each job, auto-restart via Swarm
- **Load Balancing**: 10+ workers with automatic failover
- **SSE Streaming**: Real-time output via Server-Sent Events

## Architecture

```
Client Request
     ↓
POST /execute (JSON payload)
     ↓
Orchestrator
     ├→ GitHub Pull (if specified)
     ├→ Provider Execution (claude-code, etc.)
     ├→ SSE Streaming
     └→ DB Persistence (if configured)
```

## API Specification

See [../unified-api/API_SPEC.md](../unified-api/API_SPEC.md) for complete API documentation.

### Quick Example

```bash
curl -X POST http://localhost:5000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "userRequest": "Create a hello world function",
    "codingAssistantProvider": "claude-code",
    "codingAssistantAccessToken": "sk-ant-..."
  }'
```

### With GitHub Integration

```bash
curl -X POST http://localhost:5000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "userRequest": "Add error handling to the API",
    "codingAssistantProvider": "claude-code",
    "codingAssistantAccessToken": "sk-ant-...",
    "github": {
      "repoUrl": "https://github.com/user/repo.git",
      "branch": "main"
    }
  }'
```

## Project Structure

```
unified-worker/
├── src/
│   ├── server.ts              # Main Express server
│   ├── orchestrator.ts        # Execution orchestration logic
│   ├── types.ts               # TypeScript interfaces
│   ├── clients/
│   │   ├── githubClient.ts    # GitHub repository operations
│   │   └── dbClient.ts        # Database persistence
│   └── providers/
│       ├── BaseProvider.ts    # Provider interface
│       ├── ClaudeCodeProvider.ts
│       └── ProviderFactory.ts # Provider instantiation
├── Dockerfile
├── docker-compose.yml         # Local testing
├── swarm.yml                  # Production deployment
├── deploy-swarm.sh            # Deployment script
├── entrypoint.sh              # Credential setup
└── package.json
```

## Local Development

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Claude Code credentials

### Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Create .env file**:
```bash
CLAUDE_CODE_CREDENTIALS_JSON='{"claudeAiOauth":{...}}'
```

3. **Run locally**:
```bash
npm run dev
```

### Build and Test

```bash
# Build TypeScript
npm run build

# Build Docker image
docker build -t unified-worker:latest .

# Test with Docker Compose
docker-compose up
```

## Production Deployment (Docker Swarm)

### Prerequisites

- Docker Swarm initialized: `docker swarm init`
- Claude Code credentials in `.env` file

### Deploy

```bash
chmod +x deploy-swarm.sh
./deploy-swarm.sh
```

This will:
1. Load credentials from `.env`
2. Create Docker secret
3. Build the image
4. Deploy 10 worker replicas

### Configuration

Edit `swarm.yml` to adjust:

- **Replicas**: Change `replicas: 10` to desired count
- **Resources**: Adjust CPU/memory limits
- **Network**: Configure overlay network settings

### Monitor

```bash
# List services
docker service ls

# Check replica status
docker service ps unified-worker-stack_unified-worker

# View logs
docker service logs unified-worker-stack_unified-worker -f

# Scale workers
docker service scale unified-worker-stack_unified-worker=20
```

### Stop

```bash
docker stack rm unified-worker-stack
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 5000 | Server port |
| `WORKSPACE_DIR` | No | /workspace | Working directory for code |
| `CLAUDE_CODE_CREDENTIALS_JSON` | Yes* | - | Claude Code credentials |
| `CLAUDE_CODE_CREDENTIALS_SECRET` | Yes* | - | Docker secret path (Swarm) |
| `DB_BASE_URL` | No | - | Database API URL |

*Either credentials JSON or secret required

## Endpoints

### POST /execute

Main execution endpoint. Accepts JSON payload with:

**Required**:
- `userRequest`: The prompt/instruction
- `codingAssistantProvider`: Provider name (e.g., "claude-code")
- `codingAssistantAccessToken`: Provider credentials

**Optional**:
- `resumeSessionId`: Resume existing session
- `github`: GitHub repo integration
- `database`: DB persistence settings
- `workspace`: Custom workspace path
- `providerOptions`: Provider-specific settings

**Response**: SSE stream with events:
- `connected`: Initial connection
- `message`: Progress updates
- `github_pull_progress`: Repo clone/pull status
- `assistant_message`: Provider output
- `completed`: Job finished
- `error`: Error occurred

### GET /health

Returns server health status.

### GET /status

Returns worker status: `idle` or `busy`.

## Adding New Providers

1. **Create provider class**:
```typescript
// src/providers/CursorProvider.ts
export class CursorProvider extends BaseProvider {
  async execute(userRequest, options, onEvent) {
    // Implementation
  }
}
```

2. **Register in factory**:
```typescript
// src/providers/ProviderFactory.ts
case 'cursor':
  return new CursorProvider(accessToken, workspace);
```

3. **Update supported providers list**.

## Worker Behavior

- **Ephemeral**: Each worker exits after completing a job
- **Auto-restart**: Swarm restarts workers immediately
- **Busy State**: Workers return 429 if already processing
- **Load Balancing**: Swarm distributes requests across idle workers

## Database Integration (Phase 3)

The `dbClient` is currently a stub. To integrate:

1. Implement HTTP calls in `src/clients/dbClient.ts`
2. Set `DB_BASE_URL` environment variable
3. Pass `database` object in requests:
```json
{
  "database": {
    "sessionId": "session-123",
    "accessToken": "short-lived-token"
  }
}
```

## Troubleshooting

### Worker stuck in "busy"

Workers automatically exit after each job. If stuck:
```bash
# Restart service
docker service update --force unified-worker-stack_unified-worker
```

### Credentials not loading

Check Docker secret:
```bash
docker secret inspect claude_credentials
```

Verify entrypoint logs:
```bash
docker service logs unified-worker-stack_unified-worker | grep credentials
```

### GitHub clone fails

- Verify `repoUrl` is accessible
- For private repos, include `github.accessToken`
- Check worker has internet access

## License

MIT
