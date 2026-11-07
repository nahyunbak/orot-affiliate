#!/bin/bash
set -euo pipefail
APP=/home/ubuntu/orot-affiliate
CONFIG=/home/ubuntu/.config/orot-affiliate
install -d -m 700 -o ubuntu -g ubuntu "$CONFIG"
if [ -f "$APP/.env.production" ] && [ ! -L "$APP/.env.production" ]; then
  install -m 600 -o ubuntu -g ubuntu "$APP/.env.production" "$CONFIG/.env.production"
fi
test -s "$CONFIG/.env.production"
ln -sfn "$CONFIG/.env.production" "$APP/.env.production"
chown -R ubuntu:ubuntu "$APP"
chmod 600 "$APP/.env.production"
if [ -f "$APP/.seed.json" ]; then chmod 600 "$APP/.seed.json"; fi
python3 "$APP/deploy/configure-database.py"
cd "$APP"
runuser -u ubuntu -- /usr/bin/pnpm install --frozen-lockfile --prod=false --ignore-scripts
runuser -u ubuntu -- /usr/bin/node deploy/import-test-data.cjs
cat > /etc/systemd/system/orot-affiliate.service <<'UNIT'
[Unit]
Description=Orot affiliate testnet API
After=network-online.target postgresql.service
[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/orot-affiliate
Environment=NODE_ENV=production
Environment=PORT=3007
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5
MemoryMax=512M
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable orot-affiliate.service
systemctl restart orot-affiliate.service
for attempt in $(seq 1 20); do
  if curl --silent --fail http://127.0.0.1:3007/health >/dev/null; then break; fi
  sleep 2
done
curl --silent --fail http://127.0.0.1:3007/health >/dev/null
python3 "$APP/deploy/configure-proxy.py"
echo 'OROT_API_READY port=3007 connection_pool=2 role_limit=5'
