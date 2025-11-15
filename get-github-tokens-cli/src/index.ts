#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { createServer } from 'http';
import open from 'open';

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

async function getGitHubTokens() {
  console.log('\n🔐 GitHub OAuth Token Generator\n');
  console.log('This tool helps users get GitHub access tokens to use the unified-worker');
  console.log('with their own repositories.\n');

  // Get client credentials from environment
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Error: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables are required.\n');
    console.log('Please set them before running:');
    console.log('  export GITHUB_CLIENT_ID="your_client_id"');
    console.log('  export GITHUB_CLIENT_SECRET="your_client_secret"\n');
    console.log('See QUICKSTART.md for instructions on creating a GitHub OAuth App.\n');
    process.exit(1);
  }

  const app = express();
  const server = createServer(app);

  // Promise to track when we get the code
  let resolveCode: (code: string) => void;
  const codePromise = new Promise<string>((resolve) => {
    resolveCode = resolve;
  });

  // Callback route
  app.get('/callback', async (req, res) => {
    const code = req.query.code as string;

    if (!code) {
      res.send('<h1>❌ Error: No code received</h1><p>Authorization failed.</p>');
      process.exit(1);
    }

    res.send(`
      <html>
        <head><title>GitHub Auth Success</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 100px auto; text-align: center;">
          <h1>✅ Authorization Successful!</h1>
          <p>You can close this window and return to your terminal.</p>
        </body>
      </html>
    `);

    resolveCode(code);
  });

  // Start server
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`🚀 Local server started on http://localhost:${PORT}`);
      resolve();
    });
  });

  // Build authorization URL
  const scopes = 'repo,user:email';
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}`;

  console.log('\n📖 Opening browser for GitHub authorization...');
  console.log('If the browser does not open, visit this URL manually:');
  console.log(`\n  ${authUrl}\n`);

  // Open browser
  await open(authUrl);

  // Wait for callback
  console.log('⏳ Waiting for authorization...\n');
  const code = await codePromise;

  // Exchange code for token
  console.log('🔄 Exchanging code for access token...\n');

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const tokenData = await tokenResponse.json() as GitHubTokenResponse;

  if (!tokenData.access_token) {
    console.error('❌ Error: Failed to get access token');
    console.error(JSON.stringify(tokenData, null, 2));
    server.close();
    process.exit(1);
  }

  // Display results
  console.log('✅ Success! Here are your GitHub tokens:\n');
  console.log('─'.repeat(70));
  console.log('Access Token:');
  console.log(`  ${tokenData.access_token}`);
  console.log('\nScopes:');
  console.log(`  ${tokenData.scope}`);

  if (tokenData.refresh_token) {
    console.log('\nRefresh Token:');
    console.log(`  ${tokenData.refresh_token}`);
    console.log('\nExpires In:');
    console.log(`  ${tokenData.expires_in} seconds (${Math.floor((tokenData.expires_in || 0) / 3600)} hours)`);
  } else {
    console.log('\nNote: No refresh token provided (GitHub OAuth tokens don\'t expire)');
  }
  console.log('─'.repeat(70));

  console.log('\n📝 Use this in your unified-worker requests:\n');
  console.log(JSON.stringify({
    github: {
      repoUrl: "https://github.com/your-username/your-repo.git",
      branch: "main",
      accessToken: tokenData.access_token
    }
  }, null, 2));

  console.log('\n📋 Full example request:\n');
  console.log(JSON.stringify({
    userRequest: "Add a README.md file explaining this project",
    codingAssistantProvider: "ClaudeAgentSDK",
    codingAssistantAuthentication: "{\"claudeAiOauth\":{\"accessToken\":\"sk-ant-...\",\"refreshToken\":\"sk-ant-...\",\"expiresAt\":...,\"scopes\":[...],\"subscriptionType\":\"...\"}}",
    github: {
      repoUrl: "https://github.com/your-username/your-repo.git",
      branch: "main",
      accessToken: tokenData.access_token
    },
    autoCommit: true
  }, null, 2));

  console.log('\n⚠️  IMPORTANT: Keep your access token secure!');
  console.log('   - This token has access to all your repositories');
  console.log('   - Do not commit it to version control');
  console.log('   - Revoke it when done testing at: https://github.com/settings/tokens\n');

  server.close();
  process.exit(0);
}

getGitHubTokens().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
