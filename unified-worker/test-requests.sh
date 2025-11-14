#!/bin/bash

# Test script for unified worker API
# Usage: ./test-requests.sh [mode]
# Modes: simple, github, resume, full

BASE_URL=${BASE_URL:-http://localhost:5000}
PROVIDER=${PROVIDER:-claude-code}
TOKEN=${CLAUDE_CODE_ACCESS_TOKEN:-"your-token-here"}

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Unified Worker API Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 1: Health check
test_health() {
  echo -e "${GREEN}Test: Health Check${NC}"
  curl -s "${BASE_URL}/health" | jq .
  echo ""
}

# Test 2: Status check
test_status() {
  echo -e "${GREEN}Test: Status Check${NC}"
  curl -s "${BASE_URL}/status" | jq .
  echo ""
}

# Test 3: Simple execution
test_simple() {
  echo -e "${GREEN}Test: Simple Execution${NC}"
  curl -X POST "${BASE_URL}/execute" \
    -H "Content-Type: application/json" \
    -d "{
      \"userRequest\": \"Create a hello.txt file with the text 'Hello from unified worker'\",
      \"codingAssistantProvider\": \"${PROVIDER}\",
      \"codingAssistantAccessToken\": \"${TOKEN}\"
    }" \
    --no-buffer
  echo ""
}

# Test 4: GitHub integration
test_github() {
  echo -e "${GREEN}Test: GitHub Integration${NC}"
  curl -X POST "${BASE_URL}/execute" \
    -H "Content-Type: application/json" \
    -d "{
      \"userRequest\": \"List all files in this repository\",
      \"codingAssistantProvider\": \"${PROVIDER}\",
      \"codingAssistantAccessToken\": \"${TOKEN}\",
      \"github\": {
        \"repoUrl\": \"https://github.com/webedt/hello-world.git\",
        \"branch\": \"main\"
      }
    }" \
    --no-buffer
  echo ""
}

# Test 5: Resume session (placeholder - need actual session ID)
test_resume() {
  echo -e "${GREEN}Test: Resume Session${NC}"
  echo -e "${RED}Note: Replace 'session-id-here' with actual session ID${NC}"
  echo ""
  echo "curl -X POST \"${BASE_URL}/execute\" \\"
  echo "  -H \"Content-Type: application/json\" \\"
  echo "  -d '{"
  echo "    \"userRequest\": \"Now add tests for that function\","
  echo "    \"codingAssistantProvider\": \"${PROVIDER}\","
  echo "    \"codingAssistantAccessToken\": \"${TOKEN}\","
  echo "    \"resumeSessionId\": \"session-id-here\""
  echo "  }'"
  echo ""
}

# Test 6: Full stack (GitHub + DB)
test_full() {
  echo -e "${GREEN}Test: Full Stack (GitHub + DB)${NC}"
  echo -e "${RED}Note: Requires DB_BASE_URL to be configured${NC}"
  echo ""
  echo "curl -X POST \"${BASE_URL}/execute\" \\"
  echo "  -H \"Content-Type: application/json\" \\"
  echo "  -d '{"
  echo "    \"userRequest\": \"Add README documentation\","
  echo "    \"codingAssistantProvider\": \"${PROVIDER}\","
  echo "    \"codingAssistantAccessToken\": \"${TOKEN}\","
  echo "    \"github\": {"
  echo "      \"repoUrl\": \"https://github.com/user/repo.git\""
  echo "    },"
  echo "    \"database\": {"
  echo "      \"sessionId\": \"session-123\","
  echo "      \"accessToken\": \"db-token\""
  echo "    }"
  echo "  }'"
  echo ""
}

# Test 7: Busy state (rapid requests)
test_busy() {
  echo -e "${GREEN}Test: Busy State (2 rapid requests)${NC}"
  echo "Request 1 (should succeed):"
  curl -X POST "${BASE_URL}/execute" \
    -H "Content-Type: application/json" \
    -d "{
      \"userRequest\": \"Echo test 1\",
      \"codingAssistantProvider\": \"${PROVIDER}\",
      \"codingAssistantAccessToken\": \"${TOKEN}\"
    }" &

  sleep 0.5

  echo ""
  echo "Request 2 (should return 429 busy):"
  curl -s -X POST "${BASE_URL}/execute" \
    -H "Content-Type: application/json" \
    -d "{
      \"userRequest\": \"Echo test 2\",
      \"codingAssistantProvider\": \"${PROVIDER}\",
      \"codingAssistantAccessToken\": \"${TOKEN}\"
    }" | jq .

  wait
  echo ""
}

# Parse command line argument
MODE=${1:-all}

case $MODE in
  health)
    test_health
    ;;
  status)
    test_status
    ;;
  simple)
    test_simple
    ;;
  github)
    test_github
    ;;
  resume)
    test_resume
    ;;
  full)
    test_full
    ;;
  busy)
    test_busy
    ;;
  all)
    test_health
    test_status
    test_simple
    # test_github  # Uncomment to test GitHub integration
    # test_busy    # Uncomment to test busy state
    test_resume
    test_full
    ;;
  *)
    echo "Usage: $0 [health|status|simple|github|resume|full|busy|all]"
    exit 1
    ;;
esac

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Tests Complete${NC}"
echo -e "${BLUE}========================================${NC}"
