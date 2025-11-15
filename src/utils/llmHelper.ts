import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';

/**
 * Helper for making one-off LLM requests for metadata generation
 * Uses Haiku for fast, cost-effective responses
 */
export class LLMHelper {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate a concise session name from user request
   * Example: "Create a hello.txt file" -> "Create hello.txt file"
   */
  async generateSessionName(userRequest: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `Generate a concise session name (max 60 characters) from this user request. The name should be descriptive but brief, suitable for a session title. Only return the session name, nothing else.

User request: ${userRequest}

Session name:`
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      const sessionName = content.text.trim();

      // Truncate if needed and clean up
      const cleanName = sessionName
        .replace(/^["']|["']$/g, '') // Remove quotes
        .substring(0, 60)
        .trim();

      logger.info('Generated session name', {
        component: 'LLMHelper',
        userRequest: userRequest.substring(0, 100),
        sessionName: cleanName
      });

      return cleanName;
    } catch (error) {
      logger.error('Failed to generate session name', error, {
        component: 'LLMHelper'
      });
      // Fallback: truncate user request
      return userRequest.substring(0, 60).trim();
    }
  }

  /**
   * Generate a commit message from git diff output
   */
  async generateCommitMessage(gitStatus: string, gitDiff: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Analyze the following git changes and generate a concise, conventional commit message. Follow these rules:
- Use conventional commit format (e.g., "feat:", "fix:", "refactor:", "docs:", etc.)
- Keep the summary line under 72 characters
- Be specific about what changed
- Only return the commit message, nothing else

Git status:
${gitStatus}

Git diff:
${gitDiff.substring(0, 4000)}

Commit message:`
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      const commitMessage = content.text.trim();

      logger.info('Generated commit message', {
        component: 'LLMHelper',
        commitMessage
      });

      return commitMessage;
    } catch (error) {
      logger.error('Failed to generate commit message', error, {
        component: 'LLMHelper'
      });
      // Fallback commit message
      return 'chore: auto-commit changes';
    }
  }
}

/**
 * Generate a GitHub-compatible branch name from session name
 * Format: webedt/{session-name}-{generatedId}
 * Max length: 100 characters (safe limit for GitHub)
 */
export function generateBranchName(sessionName: string, generatedId: string): string {
  // Clean session name: lowercase, replace spaces/special chars with hyphens
  const cleanSessionName = sessionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Leave room for prefix and ID

  // Format: webedt/{name}-{id}
  const branchName = `webedt/${cleanSessionName}-${generatedId}`;

  // Ensure it's within safe limits
  if (branchName.length > 100) {
    const maxSessionNameLength = 100 - `webedt/--${generatedId}`.length;
    const truncatedName = cleanSessionName.substring(0, maxSessionNameLength);
    return `webedt/${truncatedName}-${generatedId}`;
  }

  return branchName;
}
