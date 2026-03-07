FROM imbios/bun-node:18-slim AS deps

ARG DEBIAN_FRONTEND=noninteractive

# RUN apt-get -y update && \
#   apt-get install -yq openssl git ca-certificates
WORKDIR /app

# Install dependencies with Bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the app
FROM deps AS builder
WORKDIR /app

ARG GIT_SHA=unknown
ARG BUILD_TIME

COPY . .

ENV IS_BUILD=true

RUN NODE_OPTIONS=--max-old-space-size=3072 bun run build

RUN VERSION="$(node -p "require('./package.json').version")" && \
    GIT_SHA_VALUE="${GIT_SHA:-unknown}" && \
    BUILD_TIME_VALUE="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && \
    printf 'version=%s\ngitSha=%s\nbuildTime=%s\n' "$VERSION" "$GIT_SHA_VALUE" "$BUILD_TIME_VALUE" > /app/VERSION

# Production image, copy all the files and run next
FROM node:18-slim AS runner
WORKDIR /app

ENV NODE_ENV production

# Uncomment the following line in case you want to disable telemetry during runtime.
COPY package.json bun.lock ./

# Runtime deps for sharp (Next image optimization + server-side thumbnails)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libc6 \
    libstdc++6 \
    libgcc-s1 \
    libvips \
  && rm -rf /var/lib/apt/lists/*

# Install sharp into runtime node_modules (do not rely on Next standalone tracing)
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps sharp@0.33.5

ARG GIT_SHA=unknown
ARG BUILD_TIME
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_TIME=${BUILD_TIME}

COPY --from=builder  /app/.next/standalone ./
COPY --from=builder  /app/.next/static ./.next/static
COPY --from=builder  /app/public ./public
COPY --from=builder  /app/next.config.mjs ./
COPY --from=builder  /app/VERSION ./VERSION

EXPOSE 3001

ENV PORT 3001

CMD ["node", "server.js"]
