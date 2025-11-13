#!/bin/bash
set -e

echo "🔧 Initializing Claude Code SSE API Server..."

# Create workspace directory if it doesn't exist
WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
if [ ! -d "$WORKSPACE_DIR" ]; then
  echo "📁 Creating workspace directory: $WORKSPACE_DIR"
  mkdir -p "$WORKSPACE_DIR"
fi

# Setup Claude Code credentials from Docker secret or environment variable
CLAUDE_DIR="${HOME:=/home/claude}/.claude"
CREDENTIALS_FILE="${CLAUDE_DIR}/.credentials.json"

# Check if Docker secret is available (Swarm mode)
if [ -n "$CLAUDE_CODE_CREDENTIALS_SECRET" ] && [ -f "$CLAUDE_CODE_CREDENTIALS_SECRET" ]; then
  echo "🔐 Setting up Claude Code credentials from Docker secret..."

  # Create .claude directory if it doesn't exist
  if [ ! -d "$CLAUDE_DIR" ]; then
    mkdir -p "$CLAUDE_DIR"
  fi

  # Copy credentials from secret
  cp "$CLAUDE_CODE_CREDENTIALS_SECRET" "$CREDENTIALS_FILE"
  echo "✅ Credentials loaded from Docker secret: $CREDENTIALS_FILE"

  # Validate JSON format
  if ! jq empty "$CREDENTIALS_FILE" 2>/dev/null; then
    echo "❌ Error: Docker secret contains invalid JSON"
    exit 1
  fi

# Fallback to environment variable (for docker-compose)
elif [ -n "$CLAUDE_CODE_CREDENTIALS_JSON" ]; then
  echo "🔐 Setting up Claude Code credentials from environment variable..."

  # Create .claude directory if it doesn't exist
  if [ ! -d "$CLAUDE_DIR" ]; then
    mkdir -p "$CLAUDE_DIR"
  fi

  # Write the credentials JSON to .credentials.json
  echo "$CLAUDE_CODE_CREDENTIALS_JSON" > "$CREDENTIALS_FILE"
  echo "✅ Credentials set up at: $CREDENTIALS_FILE"

  # Validate JSON format
  if ! jq empty "$CREDENTIALS_FILE" 2>/dev/null; then
    echo "❌ Error: CLAUDE_CODE_CREDENTIALS_JSON is not valid JSON"
    exit 1
  fi
else
  echo "⚠️  Warning: No credentials found. Claude Code authentication may not work."
fi

# Change to the app directory
cd /app

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install --production
fi

# Build TypeScript if dist directory doesn't exist
if [ ! -d "dist" ]; then
  echo "🔨 Building TypeScript..."
  npm run build
fi

echo "🚀 Starting SSE API Server..."
echo "   Workspace: $WORKSPACE_DIR"
echo "   Port: ${PORT:-3000}"
echo ""

# Start the server
exec npm start
