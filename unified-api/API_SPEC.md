# Unified Coding Assistant API Specification

## POST /execute

Single endpoint that handles all coding assistant operations with different modes via JSON payload.

---

## Request Schema

```typescript
interface ExecuteRequest {
  // Required fields
  userRequest: string;                    // The prompt/instruction for the coding assistant
  codingAssistantProvider: string;        // e.g., "claude-code", "cursor", "copilot"
  codingAssistantAccessToken: string;     // Provider-specific access token/credentials

  // Optional: Session management
  resumeSessionId?: string;               // Resume an existing session

  // Optional: GitHub integration
  github?: {
    repoUrl: string;                      // Repository to clone/pull
    branch?: string;                      // Branch to checkout (default: main)
    directory?: string;                   // Custom directory name
    accessToken?: string;                 // GitHub access token (for private repos)
    refreshToken?: string;                // GitHub refresh token
  };

  // Optional: Database persistence
  database?: {
    sessionId: string;                    // Session ID to persist to
    accessToken: string;                  // Short-lived DB access token
  };

  // Optional: Workspace configuration
  workspace?: {
    path?: string;                        // Custom workspace path
    environment?: string;                 // Environment ID (e.g., "node22", "python311")
  };

  // Optional: Provider-specific options
  providerOptions?: {
    skipPermissions?: boolean;            // For Claude Code
    model?: string;                       // Model to use
    [key: string]: any;                   // Provider-specific settings
  };
}
```

---

## Response Schema

### Success - Streaming (SSE)

```typescript
// Event: connected
{
  type: "connected",
  sessionId: string,
  resuming: boolean,
  resumedFrom?: string,
  provider: string
}

// Event: message (progress updates)
{
  type: "message",
  message: string,
  timestamp: string
}

// Event: github_pull_progress
{
  type: "github_pull_progress",
  data: {
    type: "message" | "completed",
    message?: string,
    targetPath?: string
  },
  timestamp: string
}

// Event: assistant_message (actual coding assistant output)
{
  type: "assistant_message",
  content: any,                           // Provider-specific response format
  timestamp: string
}

// Event: completed
{
  type: "completed",
  sessionId: string,
  duration_ms: number,
  timestamp: string
}

// Event: error
{
  type: "error",
  error: string,
  code?: string,
  timestamp: string
}
```

### Error Responses

```typescript
// 429 - Worker Busy
{
  error: "busy",
  message: "Worker is currently processing another request",
  retryAfter?: number                     // Seconds to wait before retry
}

// 401 - Authentication Error
{
  error: "auth_error",
  message: "Invalid or expired access token",
  provider: string
}

// 400 - Bad Request
{
  error: "invalid_request",
  message: "Missing required field: userRequest",
  field?: string
}

// 404 - Repository Not Found
{
  error: "repo_not_found",
  message: "GitHub repository not found or inaccessible",
  repoUrl: string
}

// 500 - Internal Error
{
  error: "internal_error",
  message: string,
  details?: string
}
```

---

## Request Modes (implicit from payload)

### Mode 1: Simple Execution (no GitHub)
```json
{
  "userRequest": "Create a hello world function",
  "codingAssistantProvider": "claude-code",
  "codingAssistantAccessToken": "sk-ant-..."
}
```

### Mode 2: GitHub + Execution
```json
{
  "userRequest": "Add error handling to the API",
  "codingAssistantProvider": "claude-code",
  "codingAssistantAccessToken": "sk-ant-...",
  "github": {
    "repoUrl": "https://github.com/user/repo.git",
    "branch": "main"
  }
}
```

### Mode 3: Resume Session
```json
{
  "userRequest": "Now add tests for that function",
  "codingAssistantProvider": "claude-code",
  "codingAssistantAccessToken": "sk-ant-...",
  "resumeSessionId": "session-123"
}
```

### Mode 4: Full Stack (GitHub + DB persistence)
```json
{
  "userRequest": "Refactor the authentication module",
  "codingAssistantProvider": "claude-code",
  "codingAssistantAccessToken": "sk-ant-...",
  "github": {
    "repoUrl": "https://github.com/user/repo.git"
  },
  "database": {
    "sessionId": "session-456",
    "accessToken": "short-lived-token"
  }
}
```

---

## Provider Support

### Currently Supported
- `claude-code` - Anthropic Claude Code

### Planned
- `cursor` - Cursor AI
- `copilot` - GitHub Copilot
- `aider` - Aider AI
- Custom providers via plugin system

---

## Implementation Notes

1. **Orchestration Flow**:
   ```
   Request → Validate → GitHub Pull (if needed) → Execute Provider → Stream Response → DB Persist (if needed) → Complete
   ```

2. **Worker Busy Logic**:
   - Each worker maintains `busy` flag
   - Returns 429 if busy
   - Load balancer retries on different replica

3. **Session Resumption**:
   - If `resumeSessionId` present, skip GitHub pull
   - Assume workspace already exists
   - Pass resume ID to provider

4. **Error Handling**:
   - All errors streamed as SSE events
   - Final error event before closing stream
   - HTTP status codes for initial connection only
