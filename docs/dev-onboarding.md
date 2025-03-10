# Circles Onboarding

This document is designed to guide you through setting up your development environment for Circles.

---

## Prerequisites

Before you begin, ensure that you have the following prerequisites installed (using Windows system as an example):

- **Git:**  
  Essential for version control and managing code changes.  
  [Download Git](https://git-scm.com/download/win)

- **Bun:**  
  A fast JavaScript runtime.  
  [Download Bun](https://bun.sh/)  
  
  To check if Bun was installed successfully, run:
  
  ```bash
  bun -v
  ```

- **Docker:**  
  Required for containerization.  
  [Download Docker](https://www.docker.com/products/docker-desktop/)  
  
  To check if Docker was installed successfully, run:
  
  ```bash
  docker --version
  ```

- **MongoDB Compass (Optional):**  
  A graphical user interface to interact with MongoDB.  
  [Download MongoDB Compass](https://www.mongodb.com/products/tools/compass)

- **Visual Studio Code (VSCode):**  
  Our preferred Integrated Development Environment (IDE).  
  [Download VSCode](https://code.visualstudio.com/)  
  
  After installation, we highly recommend adding the following extensions:
  
  - Tailwind CSS Intellisense
  - Prettier
  - ESLint

---

## 1. Clone the Repository

1. Open a terminal in the directory where you want to keep your project.

2. Run:
   
   ```bash
   git clone -b dev https://github.com/Social-Systems-Lab/circles.git
   ```
   
   The `dev` branch is used for development.

3. Move into the main Circles folder:
   
   ```bash
   cd circles/circles
   ```

---

## 2. Obtain the `.env.local` File

Before proceeding further, you will need a file named `.env.local` that contains crucial configuration secrets (such as the `MATRIX_SHARED_SECRET`).  
**Get this file from the developers** and place it in the `circles/circles` directory.

---

## 3. Install Dependencies

From the `circles/circles` folder, run:

```bash
bun install
```

This command installs the necessary packages and dependencies for the Circles app.

---

## 4. Set Up Matrix (Synapse)

Follow these steps to configure a local Matrix Synapse server:

1. **Generate the Synapse Config**  
   In the `circles/circles` folder, run:
   
   ```bash
   docker-compose -f docker-compose.local.setup.yml run --rm synapse_setup
   ```
   
   This command generates the initial configuration files for Synapse within a Docker volume.

2. **Edit the Generated Config**  
   We need to modify the `homeserver.yaml` file that was just generated.
   
   1. Start an ephemeral container to access the Synapse data volume:
      
      ```bash
      docker run --rm -it -v circles_synapse_data:/data alpine sh
      ```
      
      > This places you inside the container where the Synapse config resides.
   
   2. Install `nano` (or use another editor of your choice) and open the config:
      
      ```bash
      apk update && apk add nano
      cd data
      nano homeserver.yaml
      ```
   
   3. **Update the following settings** in `homeserver.yaml`:
      
      - **Bind Address**  
        
        ```yaml
        bind_addresses: ['0.0.0.0']
        ```
        
        Ensure it is not `127.0.0.1`.
      
      - **Database Section**  
        Replace the existing database section with:
        
        ```yaml
        database:
          name: psycopg2
          txn_limit: 10000
          args:
            user: synapse_username
            password: synapse_password
            database: synapse
            host: circles-postgres-1
            port: 5432
            cp_min: 5
            cp_max: 10
        ```
      
      - **Media Paths**  
        
        ```yaml
        media_store_path: /data/media_store
        uploads_path: "/data/uploads"
        ```
      
      - **Registration**  
        
        ```yaml
        enable_registration: true
        enable_registration_without_verification: true
        ```
      
      - **Logging (Windows users)**  
        You may need to update the log configuration (e.g., `yourdomain.com.log.config`) to:
        
        ```yaml
        filename: /data/homeserver.log
        ```
      
      - **Shared Secret**  
        In the `homeserver.yaml`, there is a line for `registration_shared_secret`. It will look something like:
        
        ```yaml
        registration_shared_secret: "^zaSDfm^0YI@wqIjc*VN5XnJoj69lwj*W5+:cfG5H6H2&gXAA-"
        ```
        
        Copy this value. You will need to set this in your `.env.local` file as:
        
        ```bash
        MATRIX_SHARED_SECRET=^zaSDfm^0YI@wqIjc*VN5XnJoj69lwj*W5+:cfG5H6H2&gXAA-
        ```
        
        (Use the actual value from your config.)
   
   4. **Save and exit** `nano` when you're done editing (Ctrl + O, then Ctrl + X).
   
   5. **Exit** the alpine container:
      
      ```bash
      exit
      ```

3. **Start the Local Services**  
   Now that `homeserver.yaml` is configured properly, run:
   
   ```bash
   docker-compose -f docker-compose.local.yml up -d
   ```
   
   This command starts the local Matrix server, Weaviate, MongoDB, MinIO, and other services.

---

## 5. Run Circles Locally

With all required services running, you can start the Circles app itself:

1. From the `circles/circles` folder, run:
   
   ```bash
   bun dev
   ```

2. Access the Website:
   
   - Open [http://localhost](http://localhost) in your browser to see the application.

---

### Troubleshooting / Additional Tips

- If you encounter issues with Docker permissions or volume mounting, ensure that Docker is running and you have proper privileges.
- On Windows, always check paths in `.env.local` and config files to ensure they match your environment’s path style.
- If the Matrix homeserver fails to start, double-check that the `bind_addresses` and `database` settings in `homeserver.yaml` match what is shown above.

---

**Enjoy developing with Circles!**