# Multi-stage build for the SvelteKit frontend.
#
#   Stage 1 (`builder`)  — install full deps, run `npm run build`.
#   Stage 2 (runtime)    — copy the build output + prod node_modules,
#                           start `node build` as a non-root user.
#
# Pin the major-version of node so dev and prod use the same runtime.

ARG NODE_VERSION=23-alpine

# ---------------------------------------------------------------------------
# Stage 1: builder
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# `npm ci` needs both lockfile + package.json before any source is copied
# so the install layer caches independently of source edits.
COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

# Now bring in the rest of the source and produce the production build.
# SvelteKit's adapter-node writes the runnable server bundle to /app/build.
COPY . .

# Node's default heap ceiling (~2GB on the alpine image) isn't enough
# for the SvelteKit build — the SSR bundle for the war-room and case
# detail pages pushes past it and the process OOMs during mark-compact
# right after the client chunks are emitted. Give the build 4GB; the
# runtime stage below still runs at Node's default limit.
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Strip dev dependencies so the runtime image only carries what `node
# build` needs at runtime.
RUN npm prune --omit=dev


# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# Drop privileges. The node image ships a `node` user (uid 1000) we can
# reuse — owns nothing in /app so we chown the copied artefacts.
WORKDIR /app

COPY --from=builder --chown=node:node /app/build         ./build
COPY --from=builder --chown=node:node /app/node_modules  ./node_modules
COPY --from=builder --chown=node:node /app/package.json  ./package.json

USER node

ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0

EXPOSE 5173

# SvelteKit's adapter-node produces a server entry at build/index.js;
# launching `node build` runs it.
CMD ["node", "build"]
