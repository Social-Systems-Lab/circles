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
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/dev/circles/docker-compose.yml
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/dev/circles/.env
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/dev/circles/nginx.conf.template
curl -O https://raw.githubusercontent.com/Social-Systems-Lab/circles/dev/circles/docker-entrypoint.sh

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

CIRCLES_DOMAIN=""

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

    # Also set the result as a local variable
    eval "$var_name=\"$result\""
}

# Prompt for necessary configurations
echo "Please provide the following configuration details:"

prompt_for_value "CIRCLES_DOMAIN" "yourdomain.com" "Enter your domain name (e.g., example.com)"
prompt_for_value "CIRCLES_PORT" "3000" "Enter the port for Circles to run on"
prompt_for_value "NODE_ENV" "production" "Enter the Node environment (production/development)"

prompt_for_value "MONGO_PORT" "27017" "Enter MongoDB port"
prompt_for_value "MONGO_ROOT_USERNAME" "admin" "Enter MongoDB username"
prompt_for_value "MONGO_ROOT_PASSWORD" "change_me" "Enter MongoDB password" true

prompt_for_value "MINIO_PORT" "9000" "Enter MinIO port"
prompt_for_value "MINIO_ROOT_USERNAME" "minioadmin" "Enter MinIO username"
prompt_for_value "MINIO_ROOT_PASSWORD" "change_me" "Enter MinIO password" true

prompt_for_value "SYNAPSE_POSTGRES_USERNAME" "synapse_username" "Enter synapse postgres username"
prompt_for_value "SYNAPSE_POSTGRES_PASSWORD" "change_me" "Enter synapse postgres password" true

prompt_for_value "CIRCLES_URL" "https://$CIRCLES_DOMAIN" "Enter the URL to your Circles instance"
prompt_for_value "CIRCLES_REGISTRY_URL" "http://161.35.244.159:3001" "Enter the URL of a Circles Registry server"
prompt_for_value "CIRCLES_JWT_SECRET" "change_me" "Enter the secret key for user authentication (used for JWT token generation)" true


echo "Configuration complete."

read -p "Would you like to set up SSL certificates with Certbot? (y/n): " setup_ssl

if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
    # Check if Certbot is installed
    if ! [ -x "$(command -v certbot)" ]; then
        echo "Certbot is required for this installation. Installing..."
        sudo apt-get update
        sudo apt-get install -y certbot
    fi

    # Stop any running Docker containers that might be using port 80
    echo "Stopping running Docker containers..."
    docker-compose down

    # Obtain SSL certificate
    echo "Obtaining SSL certificate for $CIRCLES_DOMAIN..."
    sudo certbot certonly --standalone -d $CIRCLES_DOMAIN -d www.$CIRCLES_DOMAIN

    echo "SSL certificate obtained successfully."
fi


# Start the services
echo "Starting Circles platform..."
docker-compose up -d

echo "Circles platform is now running!"
echo "You can access it at https://$CIRCLES_DOMAIN"
echo "Please make sure to secure your .env file as it contains sensitive information."