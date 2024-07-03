FROM oven/bun

WORKDIR /app

COPY package.json .
RUN bun install

COPY . .

CMD ["bun", "run", "src/app.ts"]