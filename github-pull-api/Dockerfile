FROM node:20-slim

# Install git
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m -u 1001 -s /bin/bash gituser

# Set working directory for the application
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies
RUN npm install

# Copy application source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Create workspace directory
RUN mkdir -p /workspace && chown -R gituser:gituser /workspace /app

# Switch to non-root user
USER gituser

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV WORKSPACE_DIR=/workspace

# Expose API port
EXPOSE 4000

# Start the server
CMD ["npm", "start"]
