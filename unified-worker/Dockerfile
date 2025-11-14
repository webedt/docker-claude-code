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

# Create .claude directory for credentials
RUN mkdir -p /home/worker/.claude && \
    chown -R worker:worker /home/worker/.claude

# Copy and prepare entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    chown worker:worker /entrypoint.sh

# Switch to non-root user
USER worker

# Set environment variables
ENV PORT=5000
ENV WORKSPACE_DIR=/workspace
ENV NODE_ENV=production

# Expose port
EXPOSE 5000

# Use entrypoint script to set up credentials
ENTRYPOINT ["/entrypoint.sh"]

# Start the server
CMD ["npm", "start"]
