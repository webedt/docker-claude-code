#!/usr/bin/env node

/**
 * Test runner for unified-worker
 * Reads credentials from .env and sends test requests
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5001';

async function sendRequest(testFile) {
  console.log(`\n📤 Sending request from: ${testFile}`);
  console.log(`🎯 Target: ${BASE_URL}/execute\n`);

  // Read test file
  const testPath = resolve(process.cwd(), testFile);
  const testData = JSON.parse(readFileSync(testPath, 'utf-8'));

  // Replace FROM_ENV placeholders with actual values
  const request = {
    ...testData,
    codingAssistantProvider: testData.codingAssistantProvider === 'FROM_ENV'
      ? process.env.CODING_ASSISTANT_PROVIDER
      : testData.codingAssistantProvider,
    codingAssistantAuthentication: testData.codingAssistantAuthentication === 'FROM_ENV'
      ? process.env.CODING_ASSISTANT_AUTHENTICATION
      : testData.codingAssistantAuthentication,
  };

  // Replace GitHub token if present
  if (request.github?.accessToken === 'FROM_ENV') {
    request.github.accessToken = process.env.GITHUB_ACCESS_TOKEN;
  }

  console.log('📋 Request summary:');
  console.log(`   Provider: ${request.codingAssistantProvider}`);
  console.log(`   User request: ${request.userRequest}`);
  if (request.github) {
    console.log(`   GitHub repo: ${request.github.repoUrl}`);
    console.log(`   Auto-commit: ${request.autoCommit || false}`);
  }
  if (request.resumeSessionId) {
    console.log(`   Resume session: ${request.resumeSessionId}`);
  }
  console.log('');

  // Send request
  const response = await fetch(`${BASE_URL}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    console.error(`❌ Request failed: ${response.status} ${response.statusText}`);
    const error = await response.text();
    console.error(error);
    process.exit(1);
  }

  // Stream SSE response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  console.log('📡 Streaming response:\n');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const event = JSON.parse(data);

          // Pretty print key events
          if (event.type === 'connected') {
            console.log(`✅ Connected - Session: ${event.sessionId.substring(0, 8)}...`);
          } else if (event.type === 'session_name') {
            console.log(`📝 Session name: ${event.sessionName}`);
            if (event.branchName) {
              console.log(`🌿 Branch: ${event.branchName}`);
            }
          } else if (event.type === 'branch_created') {
            console.log(`🌿 ${event.message}`);
          } else if (event.type === 'commit_progress') {
            console.log(`📦 Commit: ${event.message}`);
            if (event.commitHash) {
              console.log(`   Hash: ${event.commitHash}`);
            }
          } else if (event.type === 'completed') {
            console.log(`\n✅ Completed in ${event.duration_ms}ms`);
          } else if (event.type === 'error') {
            console.log(`\n❌ Error: ${event.error}`);
          } else if (event.type === 'message') {
            console.log(`💬 ${event.message}`);
          }
          // Show raw event for debugging (optional)
          // console.log(JSON.stringify(event, null, 2));
        } catch (e) {
          // Invalid JSON, skip
        }
      }
    }
  }

  console.log('\n✨ Test completed\n');
}

// Main
const testFile = process.argv[2];

if (!testFile) {
  console.log(`
Usage: node test-runner.js <test-file.json>

Environment variables:
  TEST_URL                         - Base URL (default: http://localhost:5001)
  CODING_ASSISTANT_PROVIDER        - Provider to use when test has FROM_ENV
  CODING_ASSISTANT_AUTHENTICATION  - Auth credentials when test has FROM_ENV
  GITHUB_ACCESS_TOKEN              - GitHub token when test has FROM_ENV

Examples:
  node test-runner.js test-request.json
  node test-runner.js test-github-autocommit.json
  TEST_URL=http://localhost:5001 node test-runner.js test-request.json
`);
  process.exit(1);
}

sendRequest(testFile).catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
