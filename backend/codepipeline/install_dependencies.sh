#!/bin/bash
set -euo pipefail

echo "Installing dependencies..."

cd /home/ubuntu/orot-affiliate/backend

if [ ! -f ".env.production" ]; then
    echo "❌ ERROR: .env.production file not found at /home/ubuntu/orot-affiliate/backend/.env.production"
    exit 1
fi

# Node.js 버전 확인
node --version
npm --version

# pnpm 설치 (이미 설치되어 있는지 확인)
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    sudo npm install -g pnpm
fi

# PM2 설치 (이미 설치되어 있는지 확인)
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
    echo "PM2 installed successfully"
else
    echo "PM2 is already installed"
fi

# 의존성 설치
echo "Installing project dependencies..."
CI=true pnpm install --no-frozen-lockfile

# Prisma 클라이언트 생성
echo "🔧 Generating Prisma client..."
npx prisma generate

# 데이터베이스 마이그레이션
echo "🗄️ Running database migration..."
pnpm exec dotenv -e .env.production -- npx prisma migrate deploy

# dist 폴더 확인
echo "Checking dist folder..."
if [ -d "/home/ubuntu/orot-affiliate/backend/dist" ]; then
    echo "✓ dist folder found"
    ls -la /home/ubuntu/orot-affiliate/backend/dist/
else
    echo "❌ ERROR: dist folder not found at /home/ubuntu/orot-affiliate/backend/dist"
    echo "Deployment failed: Build artifacts are missing"
    exit 1
fi

echo "Dependencies installed and build artifacts verified"
