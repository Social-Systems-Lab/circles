# Server setup

## Environment Recommendation

For the production environment, it is recommended to use a stable and secure Linux distribution such as Ubuntu LTS or Debian. Ensure the server is regularly updated and secured. The server should be able to run Docker containers and be a persistant virtual machine, i.e. not on-demand or serverless option. In AWS these are called EC2 and in Azure VMs. 2 vCPUs and 4 GB RAM would support about 5000 registered users, and 200 concurrent users.

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

3. **Build a regular Docker Image:**

```bash
docker build -t sslorg/circles:latest .
```

Push the image to Docker Hub:

```bash
docker push sslorg/circles-registry:latest
```

## Update your system (optional)

```bash
sudo apt-get update
sudo apt-get upgrade
```

## Run Circles Install Script

```bash
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/install.sh
chmod +x install.sh
./install.sh
```

Follow the prompts.
