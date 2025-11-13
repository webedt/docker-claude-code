# Docker Swarm Quick Reference

## Deployment

```bash
# Quick deploy (all-in-one)
./deploy-swarm.sh

# Manual steps
docker swarm init                                    # Initialize swarm
docker build -t claude-code-sse-api:latest .        # Build image
docker stack deploy -c swarm.yml claude-code-stack  # Deploy stack
```

## Status & Monitoring

```bash
# Service status
docker service ls
docker service ps claude-code-stack_claude-api

# Logs (follow)
docker service logs claude-code-stack_claude-api -f

# Stats
docker stats $(docker ps -q --filter "name=claude-code-stack")
```

## Scaling

```bash
# Scale to 10 replicas
docker service scale claude-code-stack_claude-api=10

# Scale to 3 replicas
docker service scale claude-code-stack_claude-api=3
```

## Updates

```bash
# Update configuration (after editing swarm.yml)
docker stack deploy -c swarm.yml claude-code-stack

# Force update (restart all replicas)
docker service update --force claude-code-stack_claude-api
```

## Cleanup

```bash
# Remove stack
docker stack rm claude-code-stack

# Leave swarm
docker swarm leave --force
```

## Testing

```bash
# Submit job
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create test.txt"}'

# Check status
curl http://localhost:3000/status

# Health check
curl http://localhost:3000/health
```

## Troubleshooting

```bash
# View service details
docker service inspect claude-code-stack_claude-api --pretty

# Check failed replicas
docker service ps claude-code-stack_claude-api --filter "desired-state=running"

# View specific container logs
docker logs <container-id>
```
