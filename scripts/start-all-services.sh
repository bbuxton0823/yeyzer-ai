#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- Yeyzer AI Services Startup Script ---"

# 1. Kill any existing services on ports 3000, 4002-4008
echo "1. Killing any existing services on ports 3000, 4002-4008..."
for port in 3000 4002 4003 4004 4005 4006 4007 4008; do
  lsof -ti:"$port" | xargs -r kill -9 || true
done
echo "   Existing services killed."

# Ensure Docker infrastructure is up and healthy
echo "2. Ensuring Docker infrastructure (PostgreSQL, Redis, Qdrant) is running..."
docker compose up -d postgres redis qdrant
echo "   Docker infrastructure started/ensured."

# Function to wait for a service to be ready
wait_for_service() {
  local service_name=$1
  local port=$2
  local health_path=${3:-/health}
  local url="http://localhost:$port$health_path"
  echo "   Waiting for $service_name on port $port..."
  for i in $(seq 1 60); do # Wait up to 60 seconds
    if curl -s "$url" | grep -q "UP"; then
      echo "   $service_name is UP."
      return 0
    fi
    sleep 1
  done
  echo "   $service_name failed to start on time."
  return 1
}

# 3. Start all backend services in background with proper PORT environment variables
echo "3. Starting backend services..."

# Auth Service
(cd services/auth && PORT=4002 npm run dev > /dev/null 2>&1) &
AUTH_PID=$!
echo "   Auth Service (PID: $AUTH_PID) starting on port 4002..."

# Profile Service
(cd services/profile && PORT=4003 npm run dev > /dev/null 2>&1) &
PROFILE_PID=$!
echo "   Profile Service (PID: $PROFILE_PID) starting on port 4003..."

# Match Engine
(cd services/match-engine && PORT=4004 npm run dev > /dev/null 2>&1) &
MATCH_PID=$!
echo "   Match Engine (PID: $MATCH_PID) starting on port 4004..."

# Conversation Service
(cd services/conversation && PORT=4005 npm run dev > /dev/null 2>&1) &
CONVERSATION_PID=$!
echo "   Conversation Service (PID: $CONVERSATION_PID) starting on port 4005..."

# Venue Service
(cd services/venue && PORT=4006 npm run dev > /dev/null 2>&1) &
VENUE_PID=$!
echo "   Venue Service (PID: $VENUE_PID) starting on port 4006..."

# Voice Service
(cd services/voice && PORT=4007 npm run dev > /dev/null 2>&1) &
VOICE_PID=$!
echo "   Voice Service (PID: $VOICE_PID) starting on port 4007..."

# Safety Service
(cd services/safety && PORT=4008 npm run dev > /dev/null 2>&1) &
SAFETY_PID=$!
echo "   Safety Service (PID: $SAFETY_PID) starting on port 4008..."

echo "   All backend services initiated. Waiting for them to become healthy..."

# Wait for each backend service to be ready
wait_for_service "Auth Service" 4002 || exit 1
wait_for_service "Profile Service" 4003 || exit 1
wait_for_service "Match Engine" 4004 || exit 1
wait_for_service "Conversation Service" 4005 || exit 1
wait_for_service "Venue Service" 4006 || exit 1
wait_for_service "Voice Service" 4007 || exit 1
wait_for_service "Safety Service" 4008 || exit 1

echo "4. Starting Frontend..."
(cd frontend && npm run dev > /dev/null 2>&1) &
FRONTEND_PID=$!
echo "   Frontend (PID: $FRONTEND_PID) starting on port 3000..."
wait_for_service "Frontend" 3000 || exit 1

echo "--- All Services Started! ---"
echo "Frontend: http://localhost:3000"
echo "Auth Service: http://localhost:4002/health"
echo "Profile Service: http://localhost:4003/health"
echo "Match Engine: http://localhost:4004/health"
echo "Conversation Service: http://localhost:4005/health"
echo "Venue Service: http://localhost:4006/health"
echo "Voice Service: http://localhost:4007/health"
echo "Safety Service: http://localhost:4008/health"
echo ""
echo "To stop all services, run: kill $AUTH_PID $PROFILE_PID $MATCH_PID $CONVERSATION_PID $VENUE_PID $VOICE_PID $SAFETY_PID $FRONTEND_PID"
echo "Or simply run: docker compose down"
echo "You can also use 'pkill -f \"npm run dev\"' to kill all node processes started by this script."
