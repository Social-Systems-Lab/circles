## **Build Docker Image**

To build a multi-platform Docker image, follow these steps:

1. **Enable Buildx Driver:**

   ```bash
   docker buildx create --name mybuilder --use
   ```

2. **Build the Multi-Platform Docker Image:**

   ```bash
   docker buildx build --platform linux/arm64,linux/amd64 -t sslorg/circles:latest --push .
   ```

Feel free to reach out to the team through our communication channels if you encounter any issues or need further clarification.