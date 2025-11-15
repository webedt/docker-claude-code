import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Utility for managing provider credential files
 */
export class CredentialManager {
  /**
   * Write credentials to a file with secure permissions
   * @param credentialPath - Absolute path to credential file
   * @param credentials - Credentials object to write
   */
  static writeCredentialFile(credentialPath: string, credentials: any): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(credentialPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      // Write credentials as JSON
      fs.writeFileSync(
        credentialPath,
        JSON.stringify(credentials, null, 2),
        { mode: 0o600 }
      );

      console.log(`[CredentialManager] Credentials written to: ${credentialPath}`);
    } catch (error) {
      throw new Error(
        `Failed to write credentials to ${credentialPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Read credentials from a file
   * @param credentialPath - Absolute path to credential file
   * @returns Parsed credentials object
   */
  static readCredentialFile(credentialPath: string): any {
    try {
      if (!fs.existsSync(credentialPath)) {
        throw new Error(`Credential file not found: ${credentialPath}`);
      }

      const content = fs.readFileSync(credentialPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Failed to read credentials from ${credentialPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get credential path for Claude Agent SDK
   * @returns Absolute path to ~/.claude/.credentials.json
   */
  static getClaudeCredentialPath(): string {
    return path.join(os.homedir(), '.claude', '.credentials.json');
  }

  /**
   * Get credential path for Codex SDK
   * @returns Absolute path to ~/.codex/auth.json
   */
  static getCodexCredentialPath(): string {
    return path.join(os.homedir(), '.codex', 'auth.json');
  }

  /**
   * Write Claude Agent SDK credentials
   * @param authentication - Anthropic API key or OAuth JSON string
   */
  static writeClaudeCredentials(authentication: string): void {
    const credentialPath = this.getClaudeCredentialPath();

    // Parse authentication if it's JSON, otherwise treat as plain API key
    let credentials: any;
    try {
      credentials = JSON.parse(authentication);
      // If it's valid JSON, write it as-is (could be OAuth structure or other format)
    } catch {
      // Not JSON, treat as plain API key
      credentials = {
        apiKey: authentication,
        createdAt: new Date().toISOString()
      };
    }

    this.writeCredentialFile(credentialPath, credentials);
  }

  /**
   * Write Codex SDK credentials
   * @param authentication - Codex authentication token or JSON structure
   */
  static writeCodexCredentials(authentication: string): void {
    const credentialPath = this.getCodexCredentialPath();

    // Parse authentication if it's JSON, otherwise treat as plain auth token
    let credentials: any;
    try {
      credentials = JSON.parse(authentication);
      // If it's valid JSON, write it as-is (could be OAuth structure or other format)
    } catch {
      // Not JSON, treat as plain auth token
      credentials = {
        authToken: authentication,
        createdAt: new Date().toISOString()
      };
    }

    this.writeCredentialFile(credentialPath, credentials);
  }

  /**
   * Read Claude Agent SDK credentials
   * @returns API key
   */
  static readClaudeCredentials(): string {
    const credentialPath = this.getClaudeCredentialPath();
    const credentials = this.readCredentialFile(credentialPath);

    if (!credentials.apiKey) {
      throw new Error('Invalid Claude credentials: missing apiKey');
    }

    return credentials.apiKey;
  }

  /**
   * Read Codex SDK credentials
   * @returns Auth token
   */
  static readCodexCredentials(): string {
    const credentialPath = this.getCodexCredentialPath();
    const credentials = this.readCredentialFile(credentialPath);

    if (!credentials.authToken) {
      throw new Error('Invalid Codex credentials: missing authToken');
    }

    return credentials.authToken;
  }

  /**
   * Check if credential file exists
   * @param credentialPath - Path to check
   * @returns true if file exists
   */
  static credentialFileExists(credentialPath: string): boolean {
    return fs.existsSync(credentialPath);
  }
}
