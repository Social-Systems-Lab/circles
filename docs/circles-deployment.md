## **Build Docker Image**

To build a multi-platform Docker image (compatible with Raspberry Pi devices), follow these steps:

1. **Enable Buildx Driver:**

Enable the buildx driver if you haven't already done so.

```bash
docker buildx create --name mybuilder --use
```

2. **Build and push the Multi-Platform Docker Image:**

```bash
docker buildx build --platform linux/arm64,linux/amd64 -t sslorg/circles:latest --push .
```

3. **(Option B) Build a regular Docker Image:**

```bash
docker build -t sslorg/circles:latest .
```

Push the image to Docker Hub:

```bash
docker push sslorg/circles-registry:latest
```

