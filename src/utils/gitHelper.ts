import simpleGit, { SimpleGit } from 'simple-git';
import { logger } from './logger';

/**
 * Helper for Git operations (status, diff, commit)
 */
export class GitHelper {
  private git: SimpleGit;

  constructor(workspacePath: string) {
    this.git = simpleGit(workspacePath);
  }

  /**
   * Get git status output
   */
  async getStatus(): Promise<string> {
    try {
      const status = await this.git.status();
      return `
Branch: ${status.current}
Changes not staged: ${status.not_added.length + status.modified.length + status.deleted.length}
Untracked files: ${status.not_added.length}
Modified: ${status.modified.join(', ') || 'none'}
Deleted: ${status.deleted.join(', ') || 'none'}
New files: ${status.not_added.join(', ') || 'none'}
`.trim();
    } catch (error) {
      logger.error('Failed to get git status', error, { component: 'GitHelper' });
      throw error;
    }
  }

  /**
   * Get git diff output
   */
  async getDiff(): Promise<string> {
    try {
      const diff = await this.git.diff();
      return diff || 'No changes';
    } catch (error) {
      logger.error('Failed to get git diff', error, { component: 'GitHelper' });
      throw error;
    }
  }

  /**
   * Check if there are changes to commit
   */
  async hasChanges(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return !status.isClean();
    } catch (error) {
      logger.error('Failed to check for changes', error, { component: 'GitHelper' });
      return false;
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string): Promise<void> {
    try {
      await this.git.checkoutLocalBranch(branchName);
      logger.info('Created and checked out branch', {
        component: 'GitHelper',
        branchName
      });
    } catch (error) {
      logger.error('Failed to create branch', error, {
        component: 'GitHelper',
        branchName
      });
      throw error;
    }
  }

  /**
   * Check if branch already exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      const branches = await this.git.branchLocal();
      return branches.all.includes(branchName);
    } catch (error) {
      logger.error('Failed to check branch existence', error, {
        component: 'GitHelper',
        branchName
      });
      return false;
    }
  }

  /**
   * Commit all changes with message
   */
  async commitAll(message: string): Promise<string> {
    try {
      // Stage all changes
      await this.git.add('.');

      // Ensure Git identity is configured (fallback if global config isn't loaded)
      await this.git.addConfig('user.name', 'Unified Worker');
      await this.git.addConfig('user.email', 'worker@unified-worker.local');

      // Commit
      const result = await this.git.commit(message);

      logger.info('Created commit', {
        component: 'GitHelper',
        commitHash: result.commit,
        message
      });

      return result.commit;
    } catch (error) {
      logger.error('Failed to commit changes', error, {
        component: 'GitHelper',
        message
      });
      throw error;
    }
  }

  /**
   * Push current branch to remote
   */
  async push(remote: string = 'origin', branch?: string): Promise<void> {
    try {
      // Get current branch if not specified
      const currentBranch = branch || await this.getCurrentBranch();

      // Push to remote with upstream tracking
      await this.git.push(['-u', remote, currentBranch]);

      logger.info('Pushed to remote', {
        component: 'GitHelper',
        remote,
        branch: currentBranch
      });
    } catch (error) {
      logger.error('Failed to push to remote', error, {
        component: 'GitHelper',
        remote,
        branch
      });
      throw error;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const status = await this.git.status();
      return status.current || 'unknown';
    } catch (error) {
      logger.error('Failed to get current branch', error, { component: 'GitHelper' });
      return 'unknown';
    }
  }
}
