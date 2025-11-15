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

echo ""
echo "Note: Authentication is handled via API requests."
echo "No pre-configuration needed - credentials are written when requests are received."

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
echo '      "codingAssistantProvider": "ClaudeAgentSDK",'
echo '      "codingAssistantAuthentication": "{\"claudeAiOauth\":{...}}"'
echo '    }'"'"
echo ""
echo "Stop with:"
echo "  docker stack rm unified-worker-stack"
echo "=================================================="
