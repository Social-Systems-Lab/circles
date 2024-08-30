#!/bin/sh
set -e

# Check if SSL should be used
if [ -z "$USE_SSL" ]; then
  USE_SSL=false
fi

# Replace environment variables in the nginx.conf file
envsubst '${CIRCLES_DOMAIN} ${CIRCLES_HOST} ${CIRCLES_PORT} ${MINIO_HOST} ${MINIO_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Execute the CMD from the Dockerfile
exec "$@"