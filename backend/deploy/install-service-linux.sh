#!/usr/bin/env bash
# Installs Inodose as a systemd service (starts at boot, restarts automatically if it stops). Run with sudo.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo:  sudo ./install-service-linux.sh"; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js 20+ is not installed."; exit 1; }
[ -f "$DIR/.env" ] || { echo "Create $DIR/.env first (copy .env.example and edit it)."; exit 1; }
cat > /etc/systemd/system/inodose.service <<EOF
[Unit]
Description=Inodose Monitoring
After=network-online.target mysql.service mariadb.service
Wants=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/server.mjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now inodose
echo "Installed. Check:  systemctl status inodose   |   logs:  journalctl -u inodose -f"
