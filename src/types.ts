// Request/Response types for unified API

export interface ExecuteRequest {
  // Required fields
  userRequest: string;
  codingAssistantProvider: string;
  codingAssistantAuthentication: string;

  // Optional: Session management
  resumeSessionId?: string;

  // Optional: GitHub integration
  github?: {
    repoUrl: string;
    branch?: string;
    directory?: string;
    accessToken?: string;
    refreshToken?: string;
  };

  // Optional: Auto-commit after execution (default: true for GitHub repos)
  autoCommit?: boolean;

  // Optional: Database persistence
  database?: {
    sessionId: string;
    accessToken: string;
  };

  // Optional: Workspace configuration
  workspace?: {
    path?: string;
    environment?: string;
  };

  // Optional: Provider-specific options
  providerOptions?: {
    skipPermissions?: boolean;
    model?: string;
    [key: string]: any;
  };
}

// SSE Event types
export interface SSEEvent {
  type: string;
  timestamp: string;
  [key: string]: any;
}

export interface ConnectedEvent extends SSEEvent {
  type: 'connected';
  sessionId: string;
  resuming: boolean;
  resumedFrom?: string;
  provider: string;
}

export interface MessageEvent extends SSEEvent {
  type: 'message';
  message: string;
}

export interface GitHubPullProgressEvent extends SSEEvent {
  type: 'github_pull_progress';
  data: {
    type: 'message' | 'completed';
    message?: string;
    targetPath?: string;
  };
}

export interface AssistantMessageEvent extends SSEEvent {
  type: 'assistant_message';
  content: any;
}

export interface CompletedEvent extends SSEEvent {
  type: 'completed';
  sessionId: string;
  duration_ms: number;
}

export interface ErrorEvent extends SSEEvent {
  type: 'error';
  error: string;
  code?: string;
}

export interface SessionNameEvent extends SSEEvent {
  type: 'session_name';
  sessionName: string;
  branchName?: string;
}

export interface BranchCreatedEvent extends SSEEvent {
  type: 'branch_created';
  branchName: string;
  message: string;
}

export interface CommitProgressEvent extends SSEEvent {
  type: 'commit_progress';
  stage: 'analyzing' | 'generating_message' | 'committing' | 'completed';
  message: string;
  commitMessage?: string;
  commitHash?: string;
}

// Error response types
export interface APIError {
  error: string;
  message: string;
  [key: string]: any;
}

// Internal orchestration context
export interface ExecutionContext {
  request: ExecuteRequest;
  sessionId: string;
  volumeName: string;
  workspacePath: string;
  startTime: number;
  provider: any; // Provider-specific client instance
}

// Session metadata stored in volume
export interface SessionMetadata {
  sessionId: string;
  sessionName?: string; // Human-readable session name
  providerSessionId?: string; // Internal provider session ID (e.g., Claude Code's session_id)
  provider: string;
  createdAt: string;
  updatedAt: string;
  github?: {
    repoUrl: string;
    branch: string;
    branchName?: string; // Generated branch name (webedt/...)
    clonedPath: string;
  };
}
