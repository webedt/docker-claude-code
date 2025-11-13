# GitHub Pull API

Simple API for cloning and pulling Git repositories into a shared workspace.

## Features

- Clone Git repositories
- Pull latest changes from existing repositories
- SSE streaming for real-time progress updates
- Ephemeral container model (exits after job completion)
- Docker Swarm support with 5 replicas
- Load balancing across replicas
- Shared workspace across all replicas

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "workspace": "/workspace",
  "timestamp": "2025-11-13T04:00:00.000Z"
}
```

### GET /status
Check if server is idle or busy

**Response:**
```json
{
  "status": "idle",
  "timestamp": "2025-11-13T04:00:00.000Z"
}
```

### GET /api/repos
List all repositories in the workspace

**Response:**
```json
{
  "repos": [
    {
      "name": "my-repo",
      "path": "/workspace/my-repo",
      "modified": "2025-11-13T04:00:00.000Z"
    }
  ],
  "count": 1
}
```

### POST /api/pull
Clone or pull a repository (SSE streaming)

**Request Body:**
```json
{
  "repoUrl": "https://github.com/user/repo.git",
  "branch": "main",
  "directory": "custom-name"
}
```

**SSE Stream Events:**
```
data: {"type":"connected","jobId":"...","repoUrl":"...","targetPath":"..."}

data: {"type":"message","message":"Cloning repository...","timestamp":"..."}

data: {"type":"completed","jobId":"...","targetPath":"...","timestamp":"..."}
```

## Deployment

### Docker Compose (Single Container)
```bash
docker-compose up --build
```

### Docker Swarm (5 Replicas)
```bash
chmod +x deploy-swarm.sh
./deploy-swarm.sh
```

## Usage Examples

### Clone a repository
```bash
curl -X POST http://localhost:4000/api/pull \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/anthropics/claude-code.git"
  }'
```

### Pull latest changes (if already cloned)
```bash
curl -X POST http://localhost:4000/api/pull \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/anthropics/claude-code.git",
    "branch": "main"
  }'
```

### Clone to specific directory
```bash
curl -X POST http://localhost:4000/api/pull \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "directory": "my-custom-name"
  }'
```

### List cloned repositories
```bash
curl http://localhost:4000/api/repos
```

## Environment Variables

- `PORT` - Server port (default: 4000)
- `WORKSPACE_DIR` - Directory where repositories are cloned (default: /workspace)
- `NODE_ENV` - Node environment (default: production)

## Architecture

The API uses an ephemeral container model:
1. Container starts idle
2. Receives pull/clone request via `/api/pull`
3. Processes the git operation
4. Streams progress via SSE
5. Exits after completion
6. Docker Swarm immediately restarts the container

This ensures clean state between jobs and efficient resource usage.
