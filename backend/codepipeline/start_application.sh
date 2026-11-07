#!/bin/bash
echo "Starting application..."

cd /home/ubuntu/orot-affiliate/backend
TARGET_PROCESS="orot-affiliate-backend"

# .env.production 파일 확인
if [ ! -f ".env.production" ]; then
    echo "Warning: .env.production file not found!"
    echo "Please create /home/ubuntu/orot-affiliate/backend/.env.production"
    # .env 파일이 있으면 복사
    if [ -f ".env" ]; then
        echo "Copying .env to .env.production"
        cp .env .env.production
    else
        exit 1
    fi
fi

# 환경 변수 로드
export NODE_ENV=production
set -a
. ./.env.production
set +a

: "${PORT:?PORT must be set in .env.production}"
APP_PORT="$PORT"

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

echo "Current directory: $(pwd)"
echo "PM2 path: $PM2_PATH"
echo "App port: $APP_PORT"

# PM2 버전 불일치 해결
echo "Updating PM2..."
$PM2_PATH update

# 빌드 파일 확인
echo "Checking build files..."
if [ -f "dist/main.js" ]; then
    echo "dist/main.js found"
else
    echo "ERROR: dist/main.js not found!"
    ls -la dist/
    exit 1
fi

# 동일 호스트의 다른 서비스는 건드리지 않고 orot-affiliate 전용 프로세스와 포트만 정리한다.
echo "Cleaning up existing PM2 processes..."
$PM2_PATH delete "$TARGET_PROCESS" || true

echo "Cleaning up port $APP_PORT..."
sudo lsof -ti:"$APP_PORT" | xargs -r sudo kill -9 || true

echo "Starting PM2 process..."
if [ -f "codepipeline/ecosystem.config.js" ]; then
    echo "ecosystem.config.js found"
    $PM2_PATH start codepipeline/ecosystem.config.js --update-env || { echo "PM2 start failed"; exit 1; }
else
    echo "ecosystem.config.js not found, starting directly..."
    NODE_ENV=production $PM2_PATH start dist/main.js --name "$TARGET_PROCESS" --watch false --update-env || { echo "PM2 start failed"; exit 1; }
fi

echo "Waiting 5 seconds for process to stabilize..."
sleep 5

# PM2 상태 확인
echo "PM2 process status:"
$PM2_PATH list

# PM2 로그 확인
echo "Recent PM2 logs:"
$PM2_PATH logs "$TARGET_PROCESS" --lines 20 --nostream

echo "Application started"
