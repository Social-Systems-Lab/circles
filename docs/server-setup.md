# Server setup

## Environment Recommendation

For the production environment, it is recommended to use a stable and secure Linux distribution such as Ubuntu LTS or Debian. Ensure the server is regularly updated and secured. The server should be able to run Docker containers and be a persistant virtual machine, i.e. not on-demand or serverless option. In AWS these are called EC2 and in Azure VMs. 2 vCPUs and 4 GB RAM would support about 5000 registered users, and 200 concurrent users.

## Update your system (optional)

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

## Copy docker-compose.yml and .env file

```bash
mkdir circles
cd circles
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/docker-compose.yml
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/.env
```

## Edit the .env file

Edit the .env file and fill in config values.

## Deploy docker image

```bash
docker-compose up -d
```
