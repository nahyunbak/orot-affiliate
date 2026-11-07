#!/bin/bash
echo "Validating service..."
APP_ROOT="/home/ubuntu/orot-affiliate/backend"
ENV_FILE="${APP_ROOT}/.env.production"

if [ -f "$ENV_FILE" ]; then
    set -a
    . "$ENV_FILE"
    set +a
fi

: "${PORT:?PORT must be set in .env.production}"
APP_PORT="$PORT"
TARGET_PROCESS="orot-affiliate-backend"

# PM2 경로 설정
# PM2 경로 설정
PM2_PATH=$(command -v pm2)
if [ -z "$PM2_PATH" ]; then
    echo "PM2 not found in PATH, trying common locations..."
    if [ -f "/home/ubuntu/.local/share/pnpm/pm2" ]; then
        PM2_PATH="/home/ubuntu/.local/share/pnpm/pm2"
    elif [ -f "/home/ubuntu/.npm-global/bin/pm2" ]; then
        PM2_PATH="/home/ubuntu/.npm-global/bin/pm2"
    elif [ -f "/usr/local/bin/pm2" ]; then
        PM2_PATH="/usr/local/bin/pm2"
    elif [ -f "/usr/bin/pm2" ]; then
        PM2_PATH="/usr/bin/pm2"
    else
        echo "Error: PM2 not found"
        exit 1
    fi
fi

echo "PM2 path: $PM2_PATH"

# 서비스가 시작될 때까지 대기
MAX_RETRIES=24
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Attempting health check... ($((RETRY_COUNT+1))/$MAX_RETRIES)"

    # PM2로 프로세스 상태 확인
    echo "Checking PM2 process list..."
    $PM2_PATH list

    if $PM2_PATH list | grep -q "$TARGET_PROCESS"; then
        echo "Expected PM2 process found"
    else
        echo "Expected PM2 process not found yet"
    fi

    echo "Attempting health check on http://localhost:${APP_PORT}/health"
    HEALTH_RESPONSE=$(curl --max-time 3 -f -s -w "\n%{http_code}" "http://localhost:${APP_PORT}/health" 2>&1 || true)
    HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)
    HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

    echo "Health check response code: $HEALTH_CODE"

    if [ "$HEALTH_CODE" = "200" ]; then
        echo "Health check passed with response: $HEALTH_BODY"
        exit 0
    else
        echo "Health check failed with code: $HEALTH_CODE"
        echo "Response body: $HEALTH_BODY"
    fi

    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "Service not ready yet, waiting 5 seconds..."
        sleep 5
    fi
done

echo "Service validation failed after $MAX_RETRIES attempts"
exit 1
