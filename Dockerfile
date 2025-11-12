# Use Node.js LTS as base image
FROM node:20-slim

# Install system dependencies and Claude Code
RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | sh

# Set working directory for the application
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies (including Claude Agent SDK)
RUN npm install

# Copy application source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create workspace directory
RUN mkdir -p /workspace

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV WORKSPACE_DIR=/workspace

# Expose API port
EXPOSE 3000

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
