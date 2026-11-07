#!/bin/bash
set -euo pipefail
APP=/home/ubuntu/orot-affiliate
CONFIG=/home/ubuntu/.config/orot-affiliate
install -d -m 700 -o ubuntu -g ubuntu "$CONFIG"
if [ -f "$APP/.env.production" ] && [ ! -L "$APP/.env.production" ]; then
  install -m 600 -o ubuntu -g ubuntu "$APP/.env.production" "$CONFIG/.env.production"
fi
