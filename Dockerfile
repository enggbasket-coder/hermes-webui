# syntax=docker/dockerfile:1.7
# ---- deps (alpine is fine for npm install) -------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime -------------------------------------------------------------
# Debian (not Alpine) because the Hermes installer apt-installs prereqs
# and expects glibc (uv-managed Python wheels).
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Prereqs the Hermes installer needs (it would apt-install these itself
# under sudo, but we pre-install so the curl|bash step is small + cached).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git tini \
      build-essential python3 python3-dev libffi-dev \
      ripgrep ffmpeg \
      procps coreutils \
 && rm -rf /var/lib/apt/lists/*

# Install hermes-agent as root → binary at /usr/local/bin/hermes.
# `< /dev/null` keeps the installer in non-interactive mode (no prompts).
RUN curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh \
      | bash < /dev/null \
 && hermes version || (echo "hermes install failed — check logs above" && exit 1)

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    HERMES_HOME=/data/hermes \
    HERMES_BIN=/usr/local/bin/hermes \
    PORT=7878 \
    HOME=/root

# Next.js standalone bundle.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 7878
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
