# Server image for Coolify (or any Docker host). Bundles the two external
# tools the download subsystem shells out to — ffmpeg and yt-dlp — so a
# deploy doesn't depend on the host having them.
#
# Node 24: the server uses the built-in `node:sqlite` module, which isn't
# available on Node 20 (repo .nvmrc is stale for this).
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages --no-cache-dir -U \
         yt-dlp \
         bgutil-ytdlp-pot-provider
# ^ bgutil-ytdlp-pot-provider is the yt-dlp *plugin* that fetches YouTube
#   PO tokens from the companion HTTP service (deploy/compose.yml's
#   bgutil-provider). YouTube returns no playable formats without it.

RUN corepack enable

WORKDIR /app

# Install deps against just the manifests first, so a code-only change
# doesn't bust the dependency layer. All workspace manifests must be present
# for pnpm to build the graph; --filter keeps the actual install to the
# server and its shared dep (no web deps).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@stream/server..."

COPY packages/shared packages/shared
COPY apps/server apps/server

ENV NODE_ENV=production
# Point DB + downloaded media at a single mountpoint — attach a persistent
# volume here in Coolify so both survive redeploys.
ENV DB_PATH=/data/stream.db
ENV MEDIA_DIR=/data/media
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/server
CMD ["pnpm", "start"]
