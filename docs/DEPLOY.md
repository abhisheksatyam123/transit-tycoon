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
