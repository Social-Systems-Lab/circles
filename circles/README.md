## Installation

```bash
bun install
```

## Run locally

Run development server:

```bash
bun dev
```

Run MongoDB database in docker:

```bash
docker-compose up -d db
```

Run minio storage in docker:

```
docker-compose up -d minio
```

Run nginx reverse proxy in docker:

```
docker-compose up -d nginx
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
