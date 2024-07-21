echo "Welcome to Circles platform installation!"

# Check if Docker is installed
if ! [ -x "$(command -v docker)" ]; then
    echo "Docker is required for this installation. Exiting..."
    exit 1
fi

# Check if Docker Compose is installed
if ! [ -x "$(command -v docker-compose)" ]; then
    echo "Docker Compose is required for this installation. Exiting..."
    exit 1
fi

# Create and navigate to the circles directory
mkdir -p circles
cd circles

# Download docker-compose.yml and .env.example
echo "Downloading configuration files..."
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/docker-compose.yml
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/.env
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/nginx.conf.template
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/main/circles/docker-entrypoint.sh

# Check if files were downloaded successfully
if [ ! -f docker-compose.yml ] || [ ! -f .env ] || [ ! -f nginx.conf.template ]  || [ ! -f docker-entrypoint.sh ]; then
    echo "Error: Failed to download required files. Please check your internet connection and try again."
    exit 1
fi

# Set execute permissions for docker-entrypoint.sh
chmod +x docker-entrypoint.sh

# Function to prompt for a value with a default, generating a secure value if none is provided
generate_random_string() {
    openssl rand -base64 32
}

# Function to prompt for a value with a default
prompt_for_value() {
    local var_name=$1
    local default_value=$2
    local prompt_text=$3
    local is_secret=$4
    
    if [ "$is_secret" = true ]; then
        read -sp "$prompt_text [$default_value]: " user_input
        echo ""
    else
        read -p "$prompt_text [$default_value]: " user_input
    fi
    
    if [ -z "$user_input" ]; then
        if [ "$is_secret" = true ]; then
            user_input=$(generate_random_string)
            echo "Generated value for $var_name: $user_input"
        else
            user_input=$default_value
        fi
    fi
    sed -i "s|^$var_name=.*|$var_name=$user_input|" .env
}

# Prompt for necessary configurations
echo "Please provide the following configuration details:"

prompt_for_value "CIRCLES_PORT" "3000" "Enter the port for Circles to run on"
prompt_for_value "NODE_ENV" "production" "Enter the Node environment (production/development)"

prompt_for_value "MONGO_PORT" "27017" "Enter MongoDB port"
prompt_for_value "MONGO_USER" "admin" "Enter MongoDB username"
prompt_for_value "MONGO_PASSWORD" "change_me" "Enter MongoDB password" true

prompt_for_value "MINIO_PORT" "9000" "Enter MinIO port"
prompt_for_value "MINIO_ACCESS_KEY" "minioadmin" "Enter MinIO access key"
prompt_for_value "MINIO_SECRET_KEY" "change_me" "Enter MinIO secret key" true

prompt_for_value "CIRCLES_URL" "127.0.0.1" "Enter the URL of your Circles instance"
prompt_for_value "CIRCLES_REGISTRY_URL" "http://161.35.244.159:3001" "Enter the URL of a Circles Registry server"
prompt_for_value "CIRCLES_JWT_SECRET" "change_me" "Enter the secret key for user authentication (used for JWT token generation)" true


echo "Configuration complete."

# Start the services
echo "Starting Circles platform..."
docker-compose up -d

echo "Circles platform is now running!"
echo "You can access it at http://localhost"
echo "Please make sure to secure your .env file as it contains sensitive information."