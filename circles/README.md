## Installation

```bash
bun install
```

## Run locally

Run development server:

```bash
bun dev
```

Run the rest of the containers in docker:

```bash
docker-compose up -d --scale circles=0 --scale watchtower=0
```

Run the circles registry service by navigating to the <project-root>/circles/circles-registry directory and running:

```bash
docker-compose up -d
```

Open [http://localhost](http://localhost) with your browser to see the result.

## Run on Docker

```bash
docker-compose up -d
```

To update docker:

```bash
docker-compose up --build -d
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

## Build Docker image

Enable buildx driver.

```
docker buildx create --name mybuilder --use
```

Build the multi-platform Docker image.

```bash
docker buildx build --platform linux/arm64,linux/amd64 -t sslorg/circles:latest --push .
```
