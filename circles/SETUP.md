# Server setup (Raspberry Pi 5)

## Update your system

```bash
sudo apt-get update
sudo apt-get upgrade
```

## Install Docker

https://docs.docker.com/engine/install/debian/

## Install Docker compose

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## Copy docker-compose.yml

```bash
mkdir circles
cd circles
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/docker-compose.yml
```

## Deploy docker image

```bash
docker pull sslorg/circles:latest
docker-compose up -d
```
