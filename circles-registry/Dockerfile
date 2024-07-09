FROM oven/bun:latest as builder

WORKDIR /app

# Copy package.json and bun.lockb (if you have one)
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the application (if needed)
# RUN bun run build

# Production stage
FROM oven/bun:latest

WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app /app

# Set environment variables
ENV NODE_ENV=production

# Expose the port your app runs on
EXPOSE 3001

# Run the application
CMD ["bun", "run", "src/index.ts"]