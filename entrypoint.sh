#!/bin/bash
set -e

echo "🔧 Initializing Claude Code SSE API Server..."

# Create workspace directory if it doesn't exist
WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
if [ ! -d "$WORKSPACE_DIR" ]; then
  echo "📁 Creating workspace directory: $WORKSPACE_DIR"
  mkdir -p "$WORKSPACE_DIR"
fi

# Setup Claude Code authentication if CLAUDE_CODE_AUTH_JSON is provided
if [ -n "$CLAUDE_CODE_AUTH_JSON" ]; then
  echo "🔐 Setting up Claude Code authentication..."

  # Create .claude directory if it doesn't exist
  CLAUDE_DIR="${HOME}/.claude"
  if [ ! -d "$CLAUDE_DIR" ]; then
    mkdir -p "$CLAUDE_DIR"
  fi

  # Write the auth JSON to config.json
  CONFIG_FILE="${CLAUDE_DIR}/config.json"
  echo "$CLAUDE_CODE_AUTH_JSON" > "$CONFIG_FILE"
  echo "✅ Authentication configured at: $CONFIG_FILE"

  # Validate JSON format
  if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
    echo "❌ Error: CLAUDE_CODE_AUTH_JSON is not valid JSON"
    exit 1
  fi
else
  echo "⚠️  Warning: CLAUDE_CODE_AUTH_JSON not set. Claude Code authentication may not work."
fi

# Verify ANTHROPIC_API_KEY is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ Error: ANTHROPIC_API_KEY environment variable is required"
  exit 1
fi

echo "✅ ANTHROPIC_API_KEY is set"

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
