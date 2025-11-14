import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

export interface GitHubPullOptions {
  repoUrl: string;
  branch?: string;
  directory?: string;
  accessToken?: string;
  workspaceRoot: string;
}

export interface GitHubPullResult {
  targetPath: string;
  wasCloned: boolean;
  branch: string;
}

export class GitHubClient {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  /**
   * Clone or pull a GitHub repository
   */
  async pullRepository(options: GitHubPullOptions): Promise<GitHubPullResult> {
    const { repoUrl, branch, directory, accessToken, workspaceRoot } = options;

    // Extract repo name from URL
    const repoName = directory || this.extractRepoName(repoUrl);
    const targetPath = path.join(workspaceRoot, repoName);

    // Check if repo already exists
    const repoExists = fs.existsSync(targetPath);

    if (repoExists) {
      // Pull latest changes
      return await this.pullExisting(targetPath, branch);
    } else {
      // Clone fresh
      return await this.cloneRepository(repoUrl, targetPath, branch, accessToken);
    }
  }

  /**
   * Clone a new repository
   */
  private async cloneRepository(
    repoUrl: string,
    targetPath: string,
    branch?: string,
    accessToken?: string
  ): Promise<GitHubPullResult> {
    const cloneUrl = accessToken ? this.injectToken(repoUrl, accessToken) : repoUrl;

    const cloneOptions: string[] = [];
    if (branch) {
      cloneOptions.push('--branch', branch);
    }

    await this.git.clone(cloneUrl, targetPath, cloneOptions);

    const actualBranch = branch || 'main';

    return {
      targetPath,
      wasCloned: true,
      branch: actualBranch
    };
  }

  /**
   * Pull latest changes from existing repository
   */
  private async pullExisting(targetPath: string, branch?: string): Promise<GitHubPullResult> {
    const repoGit = simpleGit(targetPath);

    // Get current branch if not specified
    const status = await repoGit.status();
    const actualBranch = branch || status.current || 'main';

    // Checkout branch if specified and different
    if (branch && branch !== status.current) {
      await repoGit.checkout(branch);
    }

    // Pull latest changes
    await repoGit.pull(actualBranch);

    return {
      targetPath,
      wasCloned: false,
      branch: actualBranch
    };
  }

  /**
   * Extract repository name from URL
   */
  private extractRepoName(repoUrl: string): string {
    const match = repoUrl.match(/\/([^\/]+?)(\.git)?$/);
    if (!match) {
      throw new Error(`Invalid repository URL: ${repoUrl}`);
    }
    return match[1];
  }

  /**
   * Inject access token into GitHub URL
   */
  private injectToken(repoUrl: string, token: string): string {
    if (repoUrl.startsWith('https://github.com/')) {
      return repoUrl.replace('https://github.com/', `https://${token}@github.com/`);
    }
    return repoUrl;
  }
}
