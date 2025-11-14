#!/bin/bash
set -e

echo "=================================================="
echo "  Unified Worker - Docker Swarm Deployment"
echo "=================================================="

# Check if running in swarm mode
if ! docker info | grep -q "Swarm: active"; then
  echo "ERROR: Docker is not in swarm mode"
  echo "Run: docker swarm init"
  exit 1
fi

# Load environment variables from .env
if [ -f ../.env ]; then
  echo "Loading credentials from ../.env"
  set -a
  source ../.env
  set +a
elif [ -f .env ]; then
  echo "Loading credentials from .env"
  set -a
  source .env
  set +a
else
  echo "ERROR: No .env file found"
  echo "Create .env file with CLAUDE_CODE_CREDENTIALS_JSON"
  exit 1
fi

# Validate credentials
if [ -z "$CLAUDE_CODE_CREDENTIALS_JSON" ]; then
  echo "ERROR: CLAUDE_CODE_CREDENTIALS_JSON not set in .env"
  exit 1
fi

# Create Docker secret for credentials
echo ""
echo "Creating Docker secret for Claude Code credentials..."
if docker secret inspect claude_credentials >/dev/null 2>&1; then
  echo "Secret already exists, removing old version..."
  docker secret rm claude_credentials
fi

printf "%s" "$CLAUDE_CODE_CREDENTIALS_JSON" | docker secret create claude_credentials -
echo "✓ Secret created: claude_credentials"

# Build the image
echo ""
echo "Building unified-worker image..."
docker build -t unified-worker:latest .
echo "✓ Image built: unified-worker:latest"

# Deploy the stack
echo ""
echo "Deploying stack: unified-worker-stack"
docker stack deploy -c swarm.yml unified-worker-stack
echo "✓ Stack deployed"

# Wait a moment for services to start
sleep 3

# Show service status
echo ""
echo "Service status:"
docker service ls | grep unified-worker-stack

echo ""
echo "=================================================="
echo "  Deployment Complete!"
echo "=================================================="
echo ""
echo "Monitor with:"
echo "  docker service ls"
echo "  docker service ps unified-worker-stack_unified-worker"
echo "  docker service logs unified-worker-stack_unified-worker -f"
echo ""
echo "Test with:"
echo '  curl -X POST http://localhost:5000/execute \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{'
echo '      "userRequest": "Create a hello.txt file",'
echo '      "codingAssistantProvider": "claude-code",'
echo '      "codingAssistantAccessToken": "your-token"'
echo '    }'"'"
echo ""
echo "Stop with:"
echo "  docker stack rm unified-worker-stack"
echo "=================================================="
