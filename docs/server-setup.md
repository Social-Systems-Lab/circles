# Server setup

## Environment Recommendation

For the production environment, it is recommended to use a stable and secure Linux distribution such as Ubuntu LTS or Debian. Ensure the server is regularly updated and secured. The server should be able to run Docker containers and be a persistant virtual machine, i.e. not on-demand or serverless option. In AWS these are called EC2 and in Azure VMs. 2 vCPUs and 4 GB RAM would support about 5000 registered users, and 200 concurrent users.

## Update your system (optional)

```bash
sudo apt-get update
sudo apt-get upgrade
```

## Install Docker

Install Docker and Docker Compose. 

https://docs.docker.com/engine/install/

For Raspberry Pi 5 devices you want to follow the installation guide for the Debian platform.


## Run Circles Install Script

```bash
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/dev/circles/install.sh
chmod +x install.sh
./install.sh
```

Follow the prompts.

## Fix issue with watchtower (optional)

Following fixes issues with watchtower being unable to update Docker images in some instances.

https://medium.com/devops-technical-notes-and-manuals/how-to-solve-cannot-kill-docker-container-permission-denied-error-message-e3af7ccb7e29

```bash
sudo aa-remove-unknown
```

