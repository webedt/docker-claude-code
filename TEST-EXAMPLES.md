# Test Request Examples

These are example request payloads for testing the unified-worker API.

## Authentication

All examples use placeholder values for credentials. You have two options:

### Option 1: Use .env file (Recommended for Development)

Create a `.env` file with:

```bash
CODING_ASSISTANT_PROVIDER=ClaudeAgentSDK
CODING_ASSISTANT_AUTHENTICATION={"claudeAiOauth":{"accessToken":"sk-ant-oat01-...","refreshToken":"sk-ant-ort01-...","expiresAt":1763242829010,"scopes":["user:inference","user:profile"],"subscriptionType":"max"}}
```

Then use the test files as-is. The server will use credentials from `.env` when not provided in the request.

### Option 2: Provide credentials in request

Replace `"placeholder"` in the test files with your actual credentials:

```json
{
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": "{\"claudeAiOauth\":{...}}"
}
```

## Test Files

### `test-request.json`
Basic execution without GitHub integration.

```bash
curl -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d @test-request.json \
  --no-buffer
```

### `test-github.json`
Clone a GitHub repository and execute a request.

```bash
curl -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d @test-github.json \
  --no-buffer
```

### `test-github-autocommit.json`
Clone a GitHub repository, make changes, and auto-commit them.

**Note:** Replace `gho_YOUR_GITHUB_TOKEN_HERE` with your actual GitHub token.
Get a token using the `get-github-tokens-cli` tool.

```bash
curl -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d @test-github-autocommit.json \
  --no-buffer
```

Features:
- Generates session name from user request
- Creates branch with `webedt/` prefix
- Auto-commits changes with AI-generated commit message
- Streams all progress via SSE

### `test-resume.json`
Resume a previous session.

**Note:** Replace the `resumeSessionId` with an actual session ID from a previous request.

```bash
curl -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d @test-resume.json \
  --no-buffer
```

## Getting GitHub Tokens

To test GitHub integration with your own repositories:

1. Navigate to the OAuth CLI tool:
   ```bash
   cd get-github-tokens-cli
   ```

2. Set your GitHub OAuth app credentials:
   ```bash
   export GITHUB_CLIENT_ID="your_client_id"
   export GITHUB_CLIENT_SECRET="your_client_secret"
   ```

3. Run the tool:
   ```bash
   npm run dev
   ```

4. Authorize in the browser and copy the generated token

5. Use the token in `test-github-autocommit.json`

See `get-github-tokens-cli/QUICKSTART.md` for detailed setup instructions.
