# Docker Swarm Deployment Guide

This guide explains how to deploy Claude Code SSE API as a Docker Swarm service with 5 replicas.

## Architecture

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │   (port 3000)   │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐      ┌────▼─────┐      ┌────▼─────┐
    │ Replica 1 │      │ Replica 2│ ...  │ Replica 5│
    │  (idle)   │      │  (busy)  │      │  (idle)  │
    └───────────┘      └──────────┘      └──────────┘
         │                   │                  │
         └───────────────────┴──────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Shared Volume  │
                    │  ./workspace    │
                    └─────────────────┘
```

## Features

- **5 Replicas**: Always maintains 5 running containers
- **Auto-restart**: Containers automatically restart after completing jobs
- **Load Balancing**: Requests are distributed across available replicas
- **Shared Workspace**: All replicas access the same `/workspace` directory
- **Health Checks**: Monitors container health and restarts unhealthy instances

## Deployment Steps

### 1. Initialize Docker Swarm (if not already done)

```bash
docker swarm init
```

### 2. Build and Deploy

#### Option A: Using the deployment script
```bash
chmod +x deploy-swarm.sh
./deploy-swarm.sh
```

#### Option B: Manual deployment
```bash
# Build the image
docker build -t claude-code-sse-api:latest .

# Deploy the stack
docker stack deploy -c swarm.yml claude-code-stack
```

### 3. Verify Deployment

```bash
# Check service status
docker service ls

# Check replica status
docker service ps claude-code-stack_claude-api

# View logs
docker service logs claude-code-stack_claude-api -f
```

## Usage

The API is available at `http://localhost:3000` (or your swarm manager node IP).

Requests are automatically load-balanced across all 5 replicas:

```bash
# Submit a job (will be handled by an available replica)
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a file called test.txt"}'

# Check status (load balanced)
curl http://localhost:3000/status
```

## Ephemeral Container Model

Each replica follows the ephemeral model:
1. **Idle**: Container waits for a request
2. **Busy**: Processes a job when request arrives
3. **Exit**: Container exits after job completion
4. **Restart**: Swarm immediately restarts the container
5. **Back to Idle**: Ready for the next request

This ensures clean state between jobs and efficient resource usage.

## Scaling

### Increase replicas:
```bash
docker service scale claude-code-stack_claude-api=10
```

### Decrease replicas:
```bash
docker service scale claude-code-stack_claude-api=3
```

### Update via swarm.yml:
Edit `replicas: 5` in [swarm.yml](swarm.yml), then:
```bash
docker stack deploy -c swarm.yml claude-code-stack
```

## Monitoring

### Service Status
```bash
# Overall service info
docker service ls

# Detailed replica info
docker service ps claude-code-stack_claude-api --no-trunc

# Live replica status with auto-refresh
watch -n 2 'docker service ps claude-code-stack_claude-api'
```

### Logs
```bash
# All replicas
docker service logs claude-code-stack_claude-api -f

# Specific replica
docker service logs claude-code-stack_claude-api --raw -f | grep "replica-name"

# Last 100 lines
docker service logs claude-code-stack_claude-api --tail 100
```

### Resource Usage
```bash
# View stats for all containers
docker stats

# View specific service containers
docker stats $(docker ps -q --filter "name=claude-code-stack_claude-api")
```

## Configuration

### Environment Variables
Set in [swarm.yml](swarm.yml) under `environment`:
- `CLAUDE_CODE_CREDENTIALS_JSON`: Claude API credentials (required)
- `PORT`: Server port (default: 3000)
- `WORKSPACE_DIR`: Container workspace directory (default: /workspace)
- `NODE_ENV`: Node environment (default: production)

### Resource Limits
Adjust in [swarm.yml](swarm.yml) under `deploy.resources`:
```yaml
resources:
  limits:
    cpus: '1.0'
    memory: 2G
  reservations:
    cpus: '0.25'
    memory: 512M
```

### Restart Policy
The swarm configuration uses:
```yaml
restart_policy:
  condition: any        # Restart on any exit
  delay: 0s            # Restart immediately
  max_attempts: 0      # Unlimited restarts
```

## Troubleshooting

### Replicas not starting
```bash
# Check service events
docker service ps claude-code-stack_claude-api --no-trunc

# Inspect service
docker service inspect claude-code-stack_claude-api --pretty
```

### Port conflicts
If port 3000 is already in use, update the published port in [swarm.yml](swarm.yml):
```yaml
ports:
  - target: 3000
    published: 8080  # Change to available port
```

### Workspace permissions
Ensure the workspace directory is readable/writable:
```bash
chmod -R 777 ./workspace
```

## Cleanup

### Remove the stack
```bash
docker stack rm claude-code-stack
```

### Leave swarm mode (single node)
```bash
docker swarm leave --force
```

## Production Considerations

1. **Credentials Management**: Use Docker secrets instead of environment variables:
   ```bash
   echo '{"apiKey":"..."}' | docker secret create claude_credentials -
   ```

2. **Persistent Volumes**: For production, use a distributed storage solution (NFS, GlusterFS, etc.)

3. **Load Balancer**: Add a reverse proxy (Traefik, nginx) for SSL/TLS termination

4. **Monitoring**: Integrate with Prometheus/Grafana for metrics

5. **Multi-node**: Deploy across multiple nodes for high availability:
   ```bash
   # On manager node
   docker swarm init

   # On worker nodes (use token from manager)
   docker swarm join --token <token> <manager-ip>:2377
   ```

## Architecture Notes

### Load Balancing
- Swarm's ingress routing mesh distributes requests round-robin
- Sessions are stateless by design (unless using `resumeSessionId`)
- Each replica can handle jobs independently

### Workspace Sharing
- All replicas share the same `./workspace` volume
- Files created by any replica are accessible to all
- Consider using unique filenames or subdirectories per job

### Health Checks
- Containers report healthy when `/health` endpoint responds
- Unhealthy containers are automatically restarted
- Health check runs every 10 seconds

## Related Files

- [swarm.yml](swarm.yml) - Swarm stack configuration
- [Dockerfile](Dockerfile) - Container image definition
- [docker-compose.yml](docker-compose.yml) - Single-node development setup
- [deploy-swarm.sh](deploy-swarm.sh) - Automated deployment script
