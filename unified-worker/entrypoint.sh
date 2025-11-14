#!/bin/bash
set -e

# Set up Claude Code credentials
CREDENTIALS_FILE="/home/worker/.claude/.credentials.json"

# Check if Docker secret is available (Swarm mode)
if [ -n "$CLAUDE_CODE_CREDENTIALS_SECRET" ] && [ -f "$CLAUDE_CODE_CREDENTIALS_SECRET" ]; then
  echo "Setting up credentials from Docker secret..."
  cp "$CLAUDE_CODE_CREDENTIALS_SECRET" "$CREDENTIALS_FILE"
  chmod 600 "$CREDENTIALS_FILE"
  echo "Credentials loaded from secret"
# Otherwise use environment variable
elif [ -n "$CLAUDE_CODE_CREDENTIALS_JSON" ]; then
  echo "Setting up credentials from environment..."
  echo "$CLAUDE_CODE_CREDENTIALS_JSON" > "$CREDENTIALS_FILE"
  chmod 600 "$CREDENTIALS_FILE"
  echo "Credentials loaded from environment"
else
  echo "WARNING: No Claude Code credentials provided"
  echo "  Set either:"
  echo "    - CLAUDE_CODE_CREDENTIALS_JSON environment variable"
  echo "    - CLAUDE_CODE_CREDENTIALS_SECRET Docker secret"
fi

# Execute the main command
exec "$@"
