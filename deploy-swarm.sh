#!/bin/bash
set -e

echo "🚀 Deploying Claude Code SSE API to Docker Swarm"
echo ""

# Check if Docker Swarm is initialized
if ! docker info | grep -q "Swarm: active"; then
    echo "⚠️  Docker Swarm is not initialized. Initializing..."
    docker swarm init
    echo "✅ Docker Swarm initialized"
else
    echo "✅ Docker Swarm is already active"
fi

# Load environment variables from .env file
if [ -f .env ]; then
    echo "📋 Loading environment variables from .env file..."
    set -a  # Mark all variables for export
    source .env
    set +a  # Stop marking variables for export
    echo "✅ Environment variables loaded"
else
    echo "⚠️  Warning: .env file not found. Make sure CLAUDE_CODE_CREDENTIALS_JSON is set."
fi

# Create or update Docker secret with credentials
if [ -n "$CLAUDE_CODE_CREDENTIALS_JSON" ]; then
    echo ""
    echo "🔐 Setting up Docker secret for credentials..."
    # Remove existing secret if it exists (ignore error if it doesn't)
    docker secret rm claude_credentials 2>/dev/null || true
    # Create new secret (use printf to avoid newlines)
    printf "%s" "$CLAUDE_CODE_CREDENTIALS_JSON" | docker secret create claude_credentials -
    echo "✅ Docker secret created"
fi

# Build the image
echo ""
echo "🔨 Building Docker image..."
docker build -t claude-code-sse-api:latest .

# Deploy the stack
echo ""
echo "📦 Deploying stack with 5 replicas..."
docker stack deploy -c swarm.yml claude-code-stack

# Wait a moment for deployment
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Show status
echo ""
echo "📊 Service Status:"
docker service ls

echo ""
echo "📋 Replica Status:"
docker service ps claude-code-stack_claude-api

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📡 API is available at: http://localhost:3000"
echo "   - GET  /health"
echo "   - GET  /status"
echo "   - POST /api/execute"
echo ""
echo "📊 To check service status:"
echo "   docker service ls"
echo "   docker service ps claude-code-stack_claude-api"
echo ""
echo "📝 To view logs:"
echo "   docker service logs claude-code-stack_claude-api -f"
echo ""
echo "🔄 To scale replicas:"
echo "   docker service scale claude-code-stack_claude-api=10"
echo ""
echo "🗑️  To remove the stack:"
echo "   docker stack rm claude-code-stack"
