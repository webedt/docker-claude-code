# GitHub App Token Generator

A simple CLI tool to get GitHub App installation tokens for testing the unified-worker with GitHub repositories.

**Why GitHub App instead of OAuth?**
- ✅ More secure (tokens expire after 1 hour)
- ✅ Fine-grained repository permissions
- ✅ Better for automation and CI/CD
- ✅ Can be installed on specific repositories only

## Setup Steps

### 1. Create a GitHub App

1. Go to **GitHub Settings** → **Developer settings** → **GitHub Apps**
   - Direct link: https://github.com/settings/apps

2. Click **"New GitHub App"**

3. Fill in the application details:
   - **GitHub App name**: `Local Token Generator` (must be globally unique)
   - **Homepage URL**: `http://localhost:3000`
   - **Callback URL**: `http://localhost:3000/callback`
   - **Setup URL**: (leave blank)
   - **Webhook**: Uncheck "Active"
   - **Repository permissions**:
     - Contents: **Read and write**
     - Metadata: **Read-only** (automatically required)
   - **Where can this GitHub App be installed?**: **Only on this account**

4. Click **"Create GitHub App"**

5. On the app's settings page, note your:
   - **App ID** (shown at the top)
   - **Client ID** (in the "About" section)

6. Generate a **Client secret**:
   - Click "Generate a new client secret"
   - Copy the secret immediately (you won't see it again)

7. Generate a **Private key**:
   - Scroll down to "Private keys"
   - Click "Generate a private key"
   - A `.pem` file will download automatically
   - Save this file as `github-app-private-key.pem` in the `get-github-tokens-cli` directory

### 2. Install the GitHub App on Your Repositories

1. Go to your GitHub App settings page
2. Click "Install App" in the left sidebar
3. Click "Install" next to your username/organization
4. Choose:
   - **All repositories** (for testing all repos), OR
   - **Only select repositories** (choose specific repos)
5. Click "Install"

### 3. Install Dependencies

```bash
cd get-github-tokens-cli
npm install
```

### 4. Set Environment Variables

```bash
export GITHUB_APP_ID="123456"
export GITHUB_CLIENT_ID="Iv1.1234567890abcdef"
export GITHUB_CLIENT_SECRET="your_client_secret_here"
export GITHUB_PRIVATE_KEY_PATH="./github-app-private-key.pem"
```

Replace with your actual values from step 1.

### 5. Run the CLI

```bash
npm run dev
```

Or build and run:

```bash
npm run build
npm start
```

### 6. Follow the Prompts

The tool will:
1. Check that you've installed the app (press Enter to confirm)
2. List your installations
3. Create an installation access token
4. Display the token and accessible repositories
5. Show example JSON for your test requests

## What You'll Get

The CLI will output:
- **Installation Token**: Short-lived token (expires in 1 hour)
- **Expires At**: When the token will expire
- **Accessible Repositories**: List of repos the app can access
- **Example JSON**: Ready-to-use configuration for your test requests

## Example Output

```
✅ Success! Here is your GitHub App installation token:

──────────────────────────────────────────────────────────────────────
Installation Token:
  ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Expires At:
  2025-11-15T22:03:50.000Z

Accessible Repositories:
  - etgarcia/test-repo
  - etgarcia/another-repo
──────────────────────────────────────────────────────────────────────

📝 Use this in your test requests:

{
  "github": {
    "repoUrl": "https://github.com/etgarcia/test-repo.git",
    "branch": "main",
    "accessToken": "ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

## Using the Token

Add the `github` section to your unified-worker test requests:

```json
{
  "userRequest": "Add a README.md file",
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": "{...}",
  "github": {
    "repoUrl": "https://github.com/your-username/your-repo.git",
    "branch": "main",
    "accessToken": "ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  },
  "autoCommit": true
}
```

## Security Notes

⚠️ **Keep your tokens and private key secure!**

- Installation tokens expire after 1 hour (automatic security)
- Never commit `github-app-private-key.pem` to version control
- Never commit access tokens to version control
- The token has write access to selected repositories
- You can revoke app access anytime at: https://github.com/settings/installations

## Troubleshooting

**"Private key file not found" error?**
- Make sure you've downloaded the private key (.pem file)
- Save it as `github-app-private-key.pem` in the `get-github-tokens-cli` directory
- Or set `GITHUB_PRIVATE_KEY_PATH` to the correct location

**"No installations found" error?**
- Make sure you've installed the GitHub App on at least one repository
- Visit https://github.com/settings/installations to check
- Reinstall the app if needed

**"App ID or Client credentials invalid" error?**
- Double-check your environment variables
- Make sure App ID is a number (not Client ID)
- Client ID should start with "Iv1."
- Make sure there are no extra spaces or quotes

**Token expired?**
- Installation tokens expire after 1 hour
- Simply run the CLI again to get a new token
- No need to reinstall the app

## Advantages Over OAuth

| Feature | GitHub App | OAuth App |
|---------|-----------|-----------|
| Token expiration | 1 hour | Never (unless revoked) |
| Permissions | Fine-grained per-repo | Broad user-level |
| Installation | Per-repository | User-wide |
| Security | Better | Less secure |
| Best for | Automation, CI/CD | User authentication |

## Clean Up

After testing, you can:
1. Uninstall the app from https://github.com/settings/installations
2. Delete the GitHub App from https://github.com/settings/apps
3. Delete the private key file (`github-app-private-key.pem`)
