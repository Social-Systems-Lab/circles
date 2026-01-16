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
COPY . .

ENV IS_BUILD=true

RUN NODE_OPTIONS=--max-old-space-size=3072 bun run build

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

COPY --from=builder  /app/.next/standalone ./
COPY --from=builder  /app/.next/static ./.next/static
COPY --from=builder  /app/public ./public
COPY --from=builder  /app/next.config.mjs ./


EXPOSE 3001

ENV PORT 3001

CMD ["node", "server.js"]