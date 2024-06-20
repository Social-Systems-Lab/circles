# Circles Onboarding

This document is designed to guide you through setting up your development environment for Circles.

## **Prerequisites**

Before you begin, ensure that you have the following prerequisites installed (using Windows system as an example):

- **Git:** This is essential for version control and managing code changes. Download and install Git from [here](https://git-scm.com/download/win).

- **Bun**: A fast JavaScript runtime. Download and install Bun from 

  [here](https://bun.sh/).

  - To check if Bun was installed successfully, run **`bun -v`** in your terminal.

- **Docker**: This is required for containerization. Download and install Docker from 

  [here](https://www.docker.com/products/docker-desktop/).

  - To check if Docker was installed successfully, run **`docker --version`** in your terminal.

- **MongoDB Compass:** (Optional) This is a graphical user interface to interact with MongoDB. Download and install MongoDB Compass from [here](https://www.mongodb.com/products/tools/compass).

- **Visual Studio Code (VSCode)**:

  This is our preferred Integrated Development Environment (IDE). You can download it from 

  here.

  - After installation, we highly recommend adding the extensions: Tailwind CSS Intellisense, Prettier and ESLint. 

## Setup **Circles Locally**

Follow these steps to set up the Circles platform on your local machine:

1. Clone the Repository:

   - Clone the Circles repository using the following command:

     ```bash
     git clone -b dev https://github.com/Social-Systems-Lab/circles.git
     ```

   - The `dev` branch is used for development.

2. Install dependencies with Bun:

   - Navigate to the project root folder:

     ```bash
     cd circles/circles
     ```

   - Run the following command to install necessary dependencies:

     ```bash
     bun install
     ```

3. Run MongoDB Database in Docker:

   - In the project root folder, run the following command to start the MongoDB database:

     ```
     docker-compose up -d db
     ```

4. Run MinIO Storage in Docker:

   - Start the MinIO storage service using the following command:

     ```bash
     docker-compose up -d minio
     ```

5. Run Nginx Reverse Proxy in Docker:

   - Start the Nginx reverse proxy service using the following command:

     ```bash
     docker-compose up -d nginx
     ```

## **Run Circles Locally**

Once set up, you can run Circles locally. 

1. Start the Website:

   - Start the local server for the website (from the `circles/circles` folder):

     ```bash
     bun dev
     ```

2. Access the Website:

   - Open http://localhost with your browser to see the result.

