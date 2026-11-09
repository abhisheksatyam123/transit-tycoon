#!/bin/sh
# Host the production build (dist/) for the local network / Tailscale tailnet.
# Usage: tools/host.sh start|stop|restart|status|logs|install|uninstall
#   install = systemd --user service (starts on boot; linger is enabled on this host)
# Env: PORT (default 8080), TT_HOST (default: this host's Tailscale IPv4, else 0.0.0.0), BUILD=1 to rebuild first.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
RUN="$ROOT/.host"
PORT=${PORT:-8080}
BUN=$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")
CMD=${1:-status}
mkdir -p "$RUN"

ip4() { tailscale ip -4 2>/dev/null | head -1 || true; }
dns() { tailscale status --json 2>/dev/null | sed -n 's/.*"DNSName": *"\([^"]*\)".*/\1/p' | head -1; }

alive() { [ -f "$RUN/host.pid" ] && kill -0 "$(cat "$RUN/host.pid")" 2>/dev/null; }

url() {
  HOST=${TT_HOST:-$(ip4)}
  [ -n "${HOST:-}" ] || HOST=0.0.0.0
  echo "http://$HOST:$PORT"
}

start() {
  if alive; then echo "already running (pid $(cat "$RUN/host.pid")) $(url)"; return 0; fi
  if [ "${BUILD:-0}" = 1 ] || [ ! -f "$ROOT/dist/index.html" ]; then
    echo "building dist/ ..."
    (cd "$ROOT" && "$BUN" run build:web >"$RUN/build.log" 2>&1) || { echo "build failed; see $RUN/build.log"; exit 1; }
  fi
  HOST=${TT_HOST:-$(ip4)}
  [ -n "${HOST:-}" ] || HOST=0.0.0.0
  echo "starting on $HOST:$PORT"
  (cd "$ROOT" && setsid nohup env TT_HOST="$HOST" PORT="$PORT" "$BUN" tools/serve-dist.js >>"$RUN/host.log" 2>&1 & echo $! >"$RUN/host.pid")
  i=0
  while [ $i -lt 40 ]; do
    if curl -fsS -o /dev/null "$(url)/"; then
      echo "up: $(url)"; D=$(dns); [ -n "$D" ] && echo "tailnet: http://${D%.}:$PORT"; return 0
    fi
    i=$((i + 1)); sleep 0.25
  done
  echo "failed to start; see $RUN/host.log"; exit 1
}

stop() {
  if alive; then kill "$(cat "$RUN/host.pid")" 2>/dev/null || true; rm -f "$RUN/host.pid"; echo "stopped"; else echo "not running"; fi
}

UNIT="$HOME/.config/systemd/user/transit-tycoon-host.service"

install_unit() {
  stop
  mkdir -p "$(dirname "$UNIT")"
  HOST=${TT_HOST:-$(ip4)}
  [ -n "${HOST:-}" ] || HOST=0.0.0.0
  cat >"$UNIT" <<UNITEOF
[Unit]
Description=Transit Tycoon static host (Tailscale)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$BUN tools/serve-dist.js
Environment=PORT=$PORT
Environment=TT_HOST=$HOST
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
UNITEOF
  systemctl --user daemon-reload
  systemctl --user enable --now transit-tycoon-host.service
  sleep 0.5
  systemctl --user --no-pager --lines=0 status transit-tycoon-host.service | head -3
  curl -fsS -o /dev/null "$(url)/" && echo "up: $(url)"
}

case "$CMD" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 0.3; start ;;
  status)
    if alive; then echo "running (pid $(cat "$RUN/host.pid")) $(url)"; D=$(dns); [ -n "$D" ] && echo "tailnet: http://${D%.}:$PORT"; else echo "not running"; fi ;;
  logs) tail -n 40 "$RUN/host.log" 2>/dev/null || echo "no log yet" ;;
  install) install_unit ;;
  uninstall) systemctl --user disable --now transit-tycoon-host.service 2>/dev/null || true; rm -f "$UNIT"; systemctl --user daemon-reload; echo "service removed" ;;
  *) echo "usage: tools/host.sh start|stop|restart|status|logs"; exit 2 ;;
esac
