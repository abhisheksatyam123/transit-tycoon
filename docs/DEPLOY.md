# Static Hosting & Deployment Guide

This document describes how to build, verify, and host **Transit Tycoon JS** on static web hosting providers (such as GitHub Pages, Cloudflare Pages, Netlify, Vercel, S3/CloudFront, or self-hosted Nginx / Caddy).

---

## 1. Quick Build & Validation

```sh
# 1. Build production bundle into dist/
bun run build:web

# 2. Validate production bundle integrity
bun run check:dist

# 3. (Optional) Run local static server to test
bun run serve:dist
```

`dist/` is git-ignored and contains all static assets required for the production web app.

---

## 2. Directory Layout & Artifacts

After `bun run build:web`, the `dist/` directory has the following structure (~11.3 MB total uncompressed, 2,217 files):

- `index.html` (~1.6 KB): The HTML entry point with `<link rel="modulepreload">` for code-split chunks and early preloads for OpenGFX atlas/manifest.
- `js/`:
  - `main.js` (~740 KB minified): Bundled entry point for the simulation, UI, audio, and renderer.
  - `saveWorker.js` (~600 B): Dedicated Web Worker for asynchronous save compression.
  - `chunk-*.js`: Code-split dynamic chunks loaded on demand.
- `css/`:
  - `main.css`, `windows.css` (~40 KB): Dark-glass HUD stylesheets.
- `assets/`:
  - `opengfx/`: Sprite atlases (`atlas0.png`, `manifest.json`), extra sprites, arctic, tropic, toyland packs.
  - `landmarks/`: Hi-res 3D isometric building sprites for landmarks.
  - `scenarios/`: Pre-baked scenario data (e.g. `moscow-day0.json`).

---

## 3. Subpath Hosting (e.g., GitHub Pages)

By default, all assets and modules use relative paths, which work out of the box when served from root (`/`) or relative directory URLs.

When hosting under a subpath (e.g. `https://<user>.github.io/<repo>/`), you can supply the base path during build:

```sh
# Via command-line argument:
bun run build:web --base /transit-tycoon/

# Or via environment variable:
BASE_PATH=/transit-tycoon/ bun run build:web
```

This automatically injects `<base href="/transit-tycoon/">` into `dist/index.html`.

---

## 4. HTTP Headers, MIME Types & Compression

Static file hosts should be configured with the following MIME types and caching headers:

### MIME Types
- `.html` -> `text/html; charset=utf-8`
- `.js`   -> `text/javascript; charset=utf-8`
- `.css`  -> `text/css; charset=utf-8`
- `.json` -> `application/json`
- `.png`  -> `image/png`

### Compression (Gzip / Brotli)
Enable gzip or brotli compression on text-based assets (`.js`, `.css`, `.json`, `.html`).
PNG files are already compressed; recompressing them is unnecessary.
Expected compressed payload size is ~2.5 MB total (main bundle drops from ~740 KB to ~160 KB gzip).

### Cache-Control Recommendations
- `index.html`: `no-cache` or `max-age=0, must-revalidate` (so browser always checks for newest build).
- `js/chunk-*.js`: `public, max-age=31536000, immutable` (content-hashed chunks).
- `assets/**`: `public, max-age=86400` (or immutable if versioned).

---

## 5. Web Server Configuration Examples

### Nginx
```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/transit-tycoon/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache immutable JS chunks
    location ~* ^/js/chunk-[a-z0-9]+\.js$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Ensure index.html revalidates
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache";
    }
}
```

### Caddy
```caddy
example.com {
    root * /var/www/transit-tycoon/dist
    encode gzip zstd
    file_server

    @chunks path /js/chunk-*
    header @chunks Cache-Control "public, max-age=31536000, immutable"

    @html path /index.html
    header @html Cache-Control "no-cache"
}
```

### GitHub Pages / Cloudflare Pages / Netlify
Upload or deploy the contents of `dist/` directly. No backend or runtime container is required.

---

## Tailscale / LAN hosting

Tailscale gives every device a stable `100.x.y.z` address (and a `*.ts.net` MagicDNS name) over WireGuard,
so a laptop can host the game for phones, tablets and other machines without opening a public port.

### Zero-config: `tools/host.sh`
```sh
bun run build:web            # or BUILD=1 sh tools/host.sh start
sh tools/host.sh start       # serves dist/ bound to this host's Tailscale IPv4, PORT=8080
sh tools/host.sh status      # prints pid + http://<tailscale-ip>:8080 + tailnet DNS name
sh tools/host.sh logs
sh tools/host.sh stop
sh tools/host.sh install     # systemd --user unit 'transit-tycoon-host' (Restart=on-failure, starts on boot)
sh tools/host.sh uninstall
```
- Binding: `TT_HOST` env (default: `tailscale ip -4`; falls back to `0.0.0.0` when Tailscale is down).
  Binding the tailnet address keeps the site off the LAN and off `localhost`.
- Runtime files (pid + log) live in `.host/` (git-ignored). `dist/` is rebuilt only when missing, or with `BUILD=1`.
- `install` requires user systemd; this host has `Linger=yes`, so the unit also starts at boot without a login.
- Health check: `curl -fsS http://<tailscale-ip>:8080/` must return 200; `bun run check:dist` validates the bundle.

### HTTPS on the tailnet (`tailscale serve`)
Tailscale can terminate TLS with a real `*.ts.net` certificate (no self-signed warnings on mobile):
```sh
TT_HOST=127.0.0.1 PORT=8080 sh tools/host.sh restart   # loopback: tailscaled proxies from localhost
sudo tailscale serve --bg 8080                         # https://<host>.<tailnet>.ts.net/
sudo tailscale serve status                            # or: tailscale serve status (after set --operator)
sudo tailscale serve --bg=false                        # turn the proxy off
```
Requirements: HTTPS certificates enabled for the tailnet (admin console -> DNS), and root for `tailscale serve`
the first time; `sudo tailscale set --operator=$USER` lets your user manage serve/funnel without sudo afterwards.
Do **not** use `tailscale funnel` unless you intend to make the game publicly reachable on the internet.

### Firewall and address notes
- Tailscale traffic arrives on the `tailscale0` interface; no router port-forwarding or ufw rule is needed for
  tailnet peers (ufw already allows the interface if Tailscale's install script added it; otherwise
  `sudo ufw allow in on tailscale0`).
- The MagicDNS name is stable (`abhi.tail786840.ts.net` on this host); the `100.x` address is stable too unless
  the node is removed and re-added.
- Devices must be on the same tailnet and have Tailscale running; `tailscale status` shows them as online.
- For a plain LAN (no Tailscale), `TT_HOST=0.0.0.0 PORT=8080 sh tools/host.sh start` exposes the build to the
  local network instead; combine with the host firewall as needed.
