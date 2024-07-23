FROM imbios/bun-node:18-slim AS deps

ARG DEBIAN_FRONTEND=noninteractive

# RUN apt-get -y update && \
#   apt-get install -yq openssl git ca-certificates
WORKDIR /app

# Install dependencies with Bun
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build the app
FROM deps AS builder
WORKDIR /app
COPY . .

ENV IS_BUILD=true

RUN bun run build

# Production image, copy all the files and run next
FROM node:18-slim AS runner
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

COPY --from=builder  /app/.next/standalone ./
COPY --from=builder  /app/.next/static ./.next/static
COPY --from=builder  /app/next.config.mjs ./


EXPOSE 3001

ENV PORT 3001

CMD ["node", "server.js"]