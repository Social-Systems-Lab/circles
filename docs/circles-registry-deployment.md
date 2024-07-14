# Circles Registry Deployment Guide

## 1. Prepare the Docker Image

1.1. Build the Docker image locally:

```bash
docker build -t sslorg/circles-registry:latest .
```

1.2. Push the image to Docker Hub:

```bash
docker push sslorg/circles-registry:latest
```

## 2. Set Up the Digital Ocean Droplet

2.1. SSH into your server:

2.2. Install Docker and Docker Compose if not already installed:

```bash
sudo apt update
sudo apt install docker.io docker-compose
```

2.3. Create a directory for the Circles Registry:

```bash
mkdir -p ~/circles-registry
cd ~/circles-registry
```

2.4. Copy docker-compose.yml and .env file:

```bash
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles-registry/docker-compose.yml
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles-registry/.env
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles-registry/nginx.conf
```

2.5. Edit the .env file and specify the database password.

```
nano .env
```

## 3. Deploy the Circles Registry

3.1. Start the services:

```bash
docker-compose up -d
```

## 4. Updating the Circles Registry

To update the Circles Registry:

4.1. Make changes to your local codebase
4.2. Build a new Docker image:

```bash
docker build -t yourdockerhubusername/circles-registry:latest .
```

4.3. Push the new image to Docker Hub:

```bash
docker push yourdockerhubusername/circles-registry:latest
```

Watchtower will automatically detect the new image and update the running container.

## 5. Monitoring and Logs

To view logs:

```bash
docker-compose logs -f app
```

To check the status of your services:

```bash
docker-compose ps
```

## 6. Security Considerations

-   Ensure your Digital Ocean droplet's firewall allows traffic on port 3001
-   Consider setting up SSL/TLS for secure communications
-   Regularly update your Docker images and host system
-   Use strong, unique passwords for MongoDB
