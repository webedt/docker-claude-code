# Quick Start - GitHub OAuth

This tool helps **users authenticate with their own GitHub accounts** to use the unified-worker with their repositories.

## Why OAuth (Not GitHub App)?

✅ **OAuth is correct for:**
- Users login with their own GitHub account
- Users work on their own repositories
- Web apps where users authenticate

❌ **GitHub App would be for:**
- Your organization's repositories only
- Server-to-server automation
- Not what we need here!

## Setup Steps

### 1. Create a GitHub OAuth App

1. Go to **GitHub Settings** → **Developer settings** → **OAuth Apps**
   - Direct link: https://github.com/settings/developers

2. Click **"New OAuth App"**

3. Fill in the application details:
   - **Application name**: `Unified Worker OAuth` (or any name)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/callback`
   - **Description**: (optional) `OAuth for unified coding assistant worker`

4. Click **"Register application"**

5. You'll see your **Client ID** displayed

6. Click **"Generate a new client secret"** and copy the **Client Secret**
   - ⚠️ **Important**: Save this immediately! You won't be able to see it again.

### 2. Install Dependencies

```bash
cd get-github-tokens-cli
npm install
```

### 3. Set Environment Variables

```bash
export GITHUB_CLIENT_ID="your_client_id_here"
export GITHUB_CLIENT_SECRET="your_client_secret_here"
```

Replace with the values from step 1.

### 4. Run the OAuth Flow

```bash
npm run dev
```

Or build and run:

```bash
npm run build
npm start
```

### 5. Authorize in Browser

1. The tool will open your browser to GitHub's authorization page
2. Click **"Authorize"** to grant access to your repositories
3. You'll be redirected back to `localhost:3000/callback`
4. Your access token will be displayed in the terminal

## What You'll Get

The CLI will output:
- **Access Token**: Use this for GitHub authentication (`gho_...`)
- **Scopes**: The permissions granted (`repo`, `user:email`)
- **Example JSON**: Ready-to-use configuration for your test requests

## Example Output

```
✅ Success! Here is your GitHub access token:

──────────────────────────────────────────────────────────────────────
Access Token:
  gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Scopes:
  repo,user:email
──────────────────────────────────────────────────────────────────────

📝 Use this in your unified-worker requests:

{
  "github": {
    "repoUrl": "https://github.com/your-username/your-repo.git",
    "branch": "main",
    "accessToken": "gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

## Using the Token

Add the `github` section to your unified-worker test requests:

```json
{
  "userRequest": "Add a README.md file explaining this project",
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": "{...your-claude-credentials...}",
  "github": {
    "repoUrl": "https://github.com/your-username/your-repo.git",
    "branch": "main",
    "accessToken": "gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  },
  "autoCommit": true
}
```

## Testing with Unified Worker

```bash
# Save your request
cat > test-github-oauth.json << 'EOF'
{
  "userRequest": "Add a hello.txt file",
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": "{...}",
  "github": {
    "repoUrl": "https://github.com/your-username/your-repo.git",
    "branch": "main",
    "accessToken": "gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  },
  "autoCommit": true
}
EOF

# Test it
curl -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d @test-github-oauth.json \
  --no-buffer
```

## Security Notes

⚠️ **Keep your tokens secure!**

- OAuth tokens don't expire (unless revoked)
- The token has access to ALL your repositories
- Never commit tokens to version control
- Revoke tokens when done testing at: https://github.com/settings/tokens

## Troubleshooting

**Browser doesn't open?**
- Copy the URL from the terminal and paste it into your browser manually

**"Authorization callback URL mismatch" error?**
- Make sure the OAuth App callback URL is exactly: `http://localhost:3000/callback`
- Check that port 3000 isn't already in use

**"Client ID or Secret invalid" error?**
- Double-check your environment variables
- Make sure there are no extra spaces or quotes

## For Production Use

⚠️ **This CLI is for development/testing only!**

For production, you should:
1. Build a proper OAuth flow in your web app
2. Store tokens securely (encrypted database)
3. Implement token refresh if needed
4. Use HTTPS for all OAuth callbacks
5. Validate redirect URIs properly

## Clean Up

After testing, you can:
1. Revoke the token at https://github.com/settings/tokens
2. Delete the OAuth App from https://github.com/settings/developers
