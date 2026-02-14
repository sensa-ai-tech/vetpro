#!/bin/bash
# verify-all-pages.sh — Verify ALL disease pages render without server errors
# Assumes slugs are already extracted to /tmp/vetpro_slugs.txt

cd "C:/project/vetpro"

PORT=3099
BASE_URL="http://localhost:${PORT}"
SLUG_FILE="/tmp/vetpro_slugs.txt"
RESULT_DIR="/tmp/vetpro_verify"
rm -rf "$RESULT_DIR"
mkdir -p "$RESULT_DIR"
FAIL_FILE="${RESULT_DIR}/failures.txt"
PASS_FILE="${RESULT_DIR}/passes.txt"
touch "$FAIL_FILE" "$PASS_FILE"

echo "============================================"
echo "  VetPro Disease Page Verification"
echo "============================================"
echo ""

TOTAL=$(wc -l < "$SLUG_FILE" | tr -d ' ')
echo "[1/5] Loaded ${TOTAL} disease slugs from ${SLUG_FILE}."
echo ""

if [ "$TOTAL" -eq 0 ]; then
  echo "ERROR: No slugs found in ${SLUG_FILE}."
  exit 1
fi

# --- Step 2: Start Next.js production server ---
echo "[2/5] Starting Next.js production server on port ${PORT}..."

# Kill any existing process on this port (Windows-compatible)
netstat -ano 2>/dev/null | grep ":${PORT} " | grep LISTENING | awk '{print $5}' | sort -u | while read pid; do
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    echo "   Killing existing process on port ${PORT} (PID: ${pid})..."
    taskkill //F //PID "$pid" 2>/dev/null || true
  fi
done

PORT=$PORT pnpm start > "${RESULT_DIR}/server.log" 2>&1 &
SERVER_PID=$!

# Cleanup function
cleanup() {
  echo ""
  echo "[5/5] Cleaning up..."
  if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null || true
    echo "   Server (PID ${SERVER_PID}) stopped."
  else
    echo "   Server already stopped."
  fi
}
trap cleanup EXIT

# --- Step 3: Wait for server to be ready ---
echo "[3/5] Waiting for server to be ready..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
    echo "   Server ready after ${WAITED}s."
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
  if [ $((WAITED % 10)) -eq 0 ]; then
    echo "   Still waiting... (${WAITED}s)"
  fi
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "ERROR: Server failed to start within ${MAX_WAIT}s."
  echo "Server log (last 20 lines):"
  tail -20 "${RESULT_DIR}/server.log"
  exit 1
fi
echo ""

# --- Step 4: Check all disease pages ---
echo "[4/5] Checking ${TOTAL} disease pages (10 concurrent requests)..."
echo "      This may take a few minutes..."
echo ""

# Use a function-based approach with xargs
check_one() {
  local slug="$1"
  local status
  status=$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 30 "${BASE_URL}/disease/${slug}" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    echo "$slug" >> "$PASS_FILE"
  else
    echo "${slug} ${status}" >> "$FAIL_FILE"
    echo "   FAIL: /disease/${slug} -> HTTP ${status}"
  fi
}
export -f check_one
export BASE_URL FAIL_FILE PASS_FILE

cat "$SLUG_FILE" | xargs -I {} -P 10 bash -c 'check_one "$@"' _ {}

# --- Results ---
echo ""
echo "============================================"
echo "  Results"
echo "============================================"

PASS_COUNT=$(wc -l < "$PASS_FILE" | tr -d ' ')
FAIL_COUNT=$(wc -l < "$FAIL_FILE" | tr -d ' ')
CHECKED=$((PASS_COUNT + FAIL_COUNT))

echo ""
echo "  Total slugs: ${TOTAL}"
echo "  Checked:     ${CHECKED}"
echo "  Passed:      ${PASS_COUNT}  (HTTP 200)"
echo "  Failed:      ${FAIL_COUNT}"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "--- Failed Pages ---"
  echo ""
  printf "  %-60s %s\n" "SLUG" "STATUS"
  printf "  %-60s %s\n" "------------------------------------------------------------" "------"
  sort "$FAIL_FILE" | while IFS=' ' read -r slug status; do
    printf "  %-60s %s\n" "$slug" "$status"
  done
  echo ""
  echo "RESULT: FAILED -- ${FAIL_COUNT} pages returned errors."
  exit 1
else
  echo "RESULT: ALL ${PASS_COUNT} PAGES PASSED!"
  exit 0
fi
