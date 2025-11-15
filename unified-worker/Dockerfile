FROM node:20-slim

# Install git (required for cloning repositories)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Create non-root user (required for Claude Code --dangerously-skip-permissions)
RUN useradd -m -u 1001 worker && \
    mkdir -p /workspace && \
    chown -R worker:worker /workspace

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Switch to non-root user
USER worker

# Set environment variables
ENV PORT=5000
ENV WORKSPACE_DIR=/workspace
ENV NODE_ENV=production

# Expose port
EXPOSE 5000

# Start the server
CMD ["npm", "start"]
