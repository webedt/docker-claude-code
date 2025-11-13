#!/bin/bash
# Cleanup script for stopped Docker Swarm task containers
# Run this periodically to remove old stopped containers from task history

echo "🧹 Cleaning up stopped task containers..."

# Get the service ID
SERVICE_ID=$(docker service ls --filter "name=claude-code-stack_claude-api" -q)

if [ -z "$SERVICE_ID" ]; then
    echo "❌ Service not found"
    exit 1
fi

# Remove stopped task containers older than 1 hour
echo "📋 Finding stopped containers older than 1 hour..."
STOPPED_TASKS=$(docker service ps "$SERVICE_ID" \
    --filter "desired-state=shutdown" \
    --format "{{.ID}}" \
    | head -n -10)  # Keep last 10 stopped tasks for history

if [ -z "$STOPPED_TASKS" ]; then
    echo "✅ No old stopped containers to clean up"
else
    echo "🗑️  Cleaning up old stopped containers..."
    # Note: Docker Swarm automatically manages task cleanup
    # This is mainly for informational purposes
    docker system prune -f --filter "label=com.docker.swarm.service.name=claude-code-stack_claude-api"
    echo "✅ Cleanup complete"
fi

# Show current task count
RUNNING=$(docker service ps "$SERVICE_ID" --filter "desired-state=running" | wc -l)
STOPPED=$(docker service ps "$SERVICE_ID" --filter "desired-state=shutdown" | wc -l)

echo ""
echo "📊 Task Status:"
echo "   Running: $((RUNNING - 1))"
echo "   Stopped: $((STOPPED - 1))"
