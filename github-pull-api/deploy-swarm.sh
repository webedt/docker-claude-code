#!/bin/bash
set -e

echo "🚀 Deploying GitHub Pull API to Docker Swarm"
echo ""

# Check if Docker Swarm is initialized
if ! docker info | grep -q "Swarm: active"; then
    echo "⚠️  Docker Swarm is not initialized. Initializing..."
    docker swarm init
    echo "✅ Docker Swarm initialized"
else
    echo "✅ Docker Swarm is already active"
fi

# Build the image
echo ""
echo "🔨 Building Docker image..."
docker build -t github-pull-api:latest .

# Deploy the stack
echo ""
echo "📦 Deploying stack with 5 replicas..."
docker stack deploy -c swarm.yml github-pull-stack

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
docker service ps github-pull-stack_github-pull-api

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📡 API is available at: http://localhost:4000"
echo "   - GET  /health"
echo "   - GET  /status"
echo "   - GET  /api/repos"
echo "   - POST /api/pull"
echo ""
echo "📊 To check service status:"
echo "   docker service ls"
echo "   docker service ps github-pull-stack_github-pull-api"
echo ""
echo "📝 To view logs:"
echo "   docker service logs github-pull-stack_github-pull-api -f"
echo ""
echo "🔄 To scale replicas:"
echo "   docker service scale github-pull-stack_github-pull-api=10"
echo ""
echo "🗑️  To remove the stack:"
echo "   docker stack rm github-pull-stack"
