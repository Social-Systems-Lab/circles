## Installation

```bash
bun install
```

## Run locally

Run development server:

```bash
bun dev
```

Run database in docker:

```bash
docker-compose up -d db
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Run on Docker

```bash
docker-compose up -d
```

To update docker:

```bash
docker-compose up --build -d
```

## Build Docker image (multi-platform)

Enable buildx driver.

```
docker buildx create --name mybuilder --use
```

Build the multi-platform Docker image.

```bash
# docker build -t sslorg/circles:latest .
# docker push sslorg/circles:latest

docker buildx build --platform linux/arm64,linux/amd64 -t sslorg/circles:latest --push .
```

## Deploy on Server

(in server terminal)

```bash
docker pull sslorg/circles:latest
docker-compose up -d
```
