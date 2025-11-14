// Request/Response types for unified API

export interface ExecuteRequest {
  // Required fields
  userRequest: string;
  codingAssistantProvider: string;
  codingAssistantAccessToken: string;

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
  workspacePath: string;
  startTime: number;
  provider: any; // Provider-specific client instance
}
