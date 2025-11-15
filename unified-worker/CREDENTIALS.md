# Credential Management

## Overview

Authentication credentials are passed via API requests in the `codingAssistantAuthentication` field. The system supports both OAuth JSON structures and plain API keys.

## Credential Storage

When a request is received, credentials are written to provider-specific locations:

- **ClaudeAgentSDK**: `~/.claude/.credentials.json`
- **CodexSDK**: `~/.codex/auth.json`

Credentials are written **as-is** - if you provide a JSON object, it's written as JSON. If you provide a plain string, it's wrapped in a simple structure.

## Getting OAuth Credentials

### For ClaudeAgentSDK

1. Visit [https://claude.ai](https://claude.ai)
2. Open browser DevTools → Network tab
3. Look for API requests with Authorization headers
4. Extract the OAuth credentials from requests

The OAuth structure should look like:
```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1763242829010,
    "scopes": ["user:inference", "user:profile"],
    "subscriptionType": "max"
  }
}
```

## Testing Locally

### Setup

1. Copy the example files:
```bash
cp .env.example .env
cp test-with-auth.json.example test-with-auth.json
```

2. Edit `test-with-auth.json` with your real credentials:
```json
{
  "userRequest": "Create a hello.txt file",
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": "{\"claudeAiOauth\":{\"accessToken\":\"sk-ant-oat01-...\",\"refreshToken\":\"sk-ant-ort01-...\",\"expiresAt\":1763242829010,\"scopes\":[\"user:inference\",\"user:profile\"],\"subscriptionType\":\"max\"}}"
}
```

3. Test the request:
```bash
curl -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d @test-with-auth.json \
  --no-buffer
```

## Security Notes

- ⚠️ **Never commit credentials to git**
- The `.gitignore` file excludes:
  - `.env` (environment variables)
  - `test-with-auth.json` (test file with real credentials)
- Safe to commit:
  - `.env.example` (template without real credentials)
  - `test-with-auth.json.example` (example with placeholder tokens)

## Supported Formats

### OAuth JSON (ClaudeAgentSDK)
```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1763242829010,
    "scopes": ["user:inference", "user:profile"],
    "subscriptionType": "max"
  }
}
```

### Plain API Key
For standard Anthropic API keys, you can pass a plain string:
```json
{
  "codingAssistantAuthentication": "sk-ant-api03-..."
}
```

The system will automatically wrap it:
```json
{
  "apiKey": "sk-ant-api03-...",
  "createdAt": "2025-11-15T13:59:31.001Z"
}
```

## Production Deployment

In production, credentials are provided **per request** via the API. There's no need to pre-configure credentials in environment variables or Docker secrets.

Each request includes its own authentication, making the system:
- **Multi-tenant ready**: Different users can use different credentials
- **Secure**: No shared credentials between requests
- **Flexible**: Supports multiple authentication methods simultaneously
