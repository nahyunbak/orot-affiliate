#!/bin/bash
echo "Stopping application..."
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
PM2_PATH="/home/ubuntu/.local/share/pnpm/pm2"
if [ ! -f "$PM2_PATH" ]; then
    PM2_PATH="/home/ubuntu/.npm-global/bin/pm2"
fi
if [ ! -f "$PM2_PATH" ]; then
    PM2_PATH="/usr/local/bin/pm2"
fi

# orot-affiliate 프로세스만 정리
if [ -f "$PM2_PATH" ]; then
    $PM2_PATH stop "$TARGET_PROCESS" || true
    $PM2_PATH delete "$TARGET_PROCESS" || true
fi

# 백업: orot-affiliate 포트만 정리
sudo lsof -ti:"$APP_PORT" | xargs -r sudo kill -9 || true

echo "Application stopped"
