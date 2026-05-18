# Hermes WebUI

A self-hosted, multi-profile-first dashboard for [Hermes Agent](https://hermes-agent.nousresearch.com/) — Telegram bots and other gateways included. Runs as a single Docker container.

> **Status: working slice.** Dashboard, profile switcher, profile CRUD, gateway start/stop/restart, live log streaming (SSE), and auth all work end-to-end against the documented `hermes` CLI. Chat, skills, memory, tasks, config, and files tabs are stubbed with the CLI commands they'll wrap. The Hermes adapter is isolated in `lib/hermes/` — if the on-disk profile layout differs from `$HERMES_HOME/profiles/<name>/`, change only `lib/hermes/paths.ts`.

## What's inside

```
hermes-webui/
├── app/                  # Next.js 15 App Router (TS, Tailwind)
│   ├── login/            # password gate
│   ├── (app)/            # authed shell: sidebar + tabs
│   └── api/              # profiles, gateways, logs (SSE), auth
├── components/           # Sidebar, StatusDot, Stub
├── lib/
│   ├── auth.ts           # iron-session + password verify
│   └── hermes/           # ONLY place that knows about Hermes
│       ├── paths.ts      # HERMES_HOME + profile layout assumption
│       ├── cli.ts        # subprocess wrapper around `hermes`
│       └── profiles.ts   # list/get/create/rename/delete + gateway status
├── middleware.ts         # redirects unauthed traffic to /login
├── Dockerfile            # multi-stage: builds Next standalone, installs `hermes` via pipx
├── docker-compose.yml    # binds 127.0.0.1:7878, mounts your Hermes data dir
├── scripts/              # start, update, backup
└── .env.example
```

## Hostinger VPS KM4 install

These steps assume a fresh Ubuntu 22.04+ KM4 with Docker & Compose v2 installed (`apt install docker.io docker-compose-v2` or follow Docker's official guide). Everything runs as **one container** in an **isolated bridge network**, mounting only a single host directory — nothing else on the VPS is touched.

### 1. Get the code

```bash
sudo mkdir -p /opt/hermes-webui && sudo chown "$USER" /opt/hermes-webui
cd /opt/hermes-webui
# Copy this project's files in (git clone, scp, rsync — your choice).
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env:
#   AUTH_PASSWORD=<strong password>
#   SESSION_SECRET=$(openssl rand -hex 32)
#   HERMES_DATA_DIR=/home/youruser/.hermes-webui-data   # host path
mkdir -p "$(grep HERMES_DATA_DIR .env | cut -d= -f2)/profiles"
```

> If you already run Hermes on the VPS and want this dashboard to manage *that* installation, point `HERMES_DATA_DIR` at the parent of your `profiles/` directory. **Back it up first** (`./scripts/backup.sh`) — the dashboard can write/delete profiles.

### 3. Launch

```bash
./scripts/start.sh
# or just:
docker compose up -d --build
```

The dashboard binds to `127.0.0.1:7878` only — not exposed publicly. Verify:

```bash
curl -I http://127.0.0.1:7878/login
docker compose logs -f hermes-webui
```

### 4. Reverse proxy + HTTPS (Nginx + Let's Encrypt)

Recommended for any internet-facing deployment.

```nginx
# /etc/nginx/sites-available/hermes.example.com
server {
    listen 80;
    server_name hermes.example.com;

    location / {
        proxy_pass http://127.0.0.1:7878;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for SSE log streaming:
        proxy_buffering off;
        proxy_read_timeout 24h;
        proxy_set_header Connection "";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/hermes.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hermes.example.com
```

### 5. Updates & backups

```bash
./scripts/update.sh    # git pull + rebuild + restart
./scripts/backup.sh    # tarball of all profile data into ./backups/
```

## Isolation notes

- The container runs in its own bridge network (`hermes-webui-net`) — no link to other compose stacks.
- Only `${HERMES_DATA_DIR}` is bind-mounted. Everything else (skills, sessions, logs, secrets) lives inside that directory.
- Port `7878` is bound to `127.0.0.1` by default; nothing is exposed to the public internet unless you change the binding or front it with a proxy.
- No host network, no privileged mode, no socket mounts.

## Architecture: why this is a thin shell

The dashboard is deliberately small. Every page is a UI on top of the `hermes` CLI:

| UI action | Underlying call |
| --- | --- |
| List/switch profiles | `readdir($HERMES_HOME/profiles)` |
| Create / rename / delete profile | Filesystem ops (no CLI command documented for this) |
| Gateway start / stop / restart / status | `hermes -p <name> gateway <action>` |
| Live logs | `tail -F $HERMES_HOME/profiles/<name>/logs/<file>` over SSE |
| Auth | iron-session cookie + `AUTH_PASSWORD` (plain or bcrypt) |

When the upstream `hermes` adds a real local HTTP API, swap `lib/hermes/cli.ts` for an HTTP client and every page keeps working.

## Roadmap (next tabs to wire)

1. **Chat** — SSE-streamed wrapper around `hermes chat -q`, with session persistence reading `sessions/*/messages.jsonl`.
2. **Config** — yaml-aware editor for `config.yaml`; masked editor for `.env`.
3. **Skills** — `skills list/search/install` UI + inline editor for `skills/<name>/*`.
4. **Memory** — markdown editors for SOUL/MEMORY/USER + session FTS.
5. **Tasks & Cron** — `cron list/add` UI + kanban from `cron/` folder.
6. **Files** — sandboxed workspace browser.
7. **Auth hardening** — optional TOTP, login rate limit, audit log.

## Known assumptions (verify on first run)

These are pinned in code so the rest of the app stays clean. If your Hermes install disagrees, fix `lib/hermes/paths.ts` and `lib/hermes/profiles.ts`:

1. Profiles live at `$HERMES_HOME/profiles/<name>/`, each mirroring the standard Hermes root layout.
2. `hermes -p <name> gateway status` produces text containing the word "running" / "active" when up, "stopped" / "inactive" when down.
3. The container's `hermes` CLI can read and write `$HERMES_HOME` (UID inside container must match the host owner of that directory — adjust `user:` in `docker-compose.yml` if you hit permission errors).

## License

MIT.
