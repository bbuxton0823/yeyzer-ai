#!/bin/bash

# This script starts all Yeyzer AI Match-Assistant services in separate terminal tabs/windows.
# It is designed for macOS using `osascript`.

# Get the directory where this script is located
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
# Navigate up to the project root directory
PROJECT_DIR=$(dirname "$SCRIPT_DIR")

echo "Starting Yeyzer AI Match-Assistant services..."

# --- Step 1: Start Infrastructure Services (PostgreSQL, Redis, Qdrant) ---
echo "Starting infrastructure services (postgres, redis, qdrant) via Docker Compose..."
osascript -e 'tell application "Terminal" to activate' \
          -e 'tell application "Terminal" to do script "cd \"'"$PROJECT_DIR"'\" && docker compose up -d postgres redis qdrant && echo \"Infrastructure services started. Waiting for them to become healthy...\""'
sleep 15 # Give infrastructure services time to start and become healthy

# --- Step 2: Start Backend Services ---
# Define backend services and their respective ports
declare -A backend_services
backend_services["auth"]="4002"
backend_services["profile"]="4003"
backend_services["match-engine"]="4004"
backend_services["conversation"]="4005"
backend_services["venue"]="4006"
backend_services["safety"]="4008"
backend_services["voice"]="4007"

# Common environment variables for backend services running on host
# These connect to the Dockerized infrastructure services
COMMON_ENV="DATABASE_URL=\"postgresql://postgres:postgres@localhost:5433/yeyzer\" REDIS_URL=\"redis://localhost:6379\" VECTOR_URL=\"http://localhost:6333\""

for service_name in "${!backend_services[@]}"; do
    port="${backend_services[$service_name]}"
    echo "Starting $service_name service on port $port..."
    osascript -e 'tell application "Terminal" to activate' \
              -e 'tell application "Terminal" to do script "cd \"'"$PROJECT_DIR"'/services/'"$service_name"'\" && PORT='"$port"' '"$COMMON_ENV"' npm run dev"'
    sleep 3 # Give each service a moment to initialize
done

# --- Step 3: Start Frontend Service ---
echo "Starting frontend service on port 3000..."
# Frontend needs to know the URLs of all backend services
FRONTEND_ENV="NEXT_PUBLIC_AUTH_SERVICE_URL=\"http://localhost:4002\" \
              NEXT_PUBLIC_PROFILE_SERVICE_URL=\"http://localhost:4003\" \
              NEXT_PUBLIC_MATCH_ENGINE_URL=\"http://localhost:4004\" \
              NEXT_PUBLIC_CONVERSATION_SERVICE_URL=\"http://localhost:4005\" \
              NEXT_PUBLIC_VENUE_SERVICE_URL=\"http://localhost:4006\" \
              NEXT_PUBLIC_VOICE_SERVICE_URL=\"http://localhost:4007\" \
              NEXT_PUBLIC_SAFETY_SERVICE_URL=\"http://localhost:4008\""

osascript -e 'tell application "Terminal" to activate' \
          -e 'tell application "Terminal" to do script "cd \"'"$PROJECT_DIR"'/frontend\" && '"$FRONTEND_ENV"' npm run dev"'

echo "All services are attempting to start. Check individual terminal tabs/windows for logs."
echo "Frontend should be available at http://localhost:3000"
echo "You can also access Prometheus at http://localhost:9090 and Grafana at http://localhost:3001"
