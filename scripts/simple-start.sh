#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- Yeyzer AI Simple Services Startup Script ---"
echo "This script attempts to open each service in a new terminal window/tab."
echo "If new windows don't open, services will start sequentially in this terminal."
echo ""

# 1. Kill any existing services on relevant ports
echo "1. Killing any existing services on ports 3000, 4002-4008..."
for port in 3000 4002 4003 4004 4005 4006 4007 4008; do
  lsof -ti:"$port" | xargs -r kill -9 || true
done
echo "   Existing services killed."
echo ""

# 2. Ensure Docker infrastructure is up and healthy
echo "2. Ensuring Docker infrastructure (PostgreSQL, Redis, Qdrant) is running..."
docker compose up -d postgres redis qdrant
echo "   Docker infrastructure started/ensured."
echo ""

# Function to start a service in a new terminal window/tab
start_service_in_new_terminal() {
  local service_name=$1
  local port=$2
  local path=$3
  local command="cd $(pwd) && npm run dev --workspace=@yeyzer/$path"

  echo "   Attempting to start $service_name on port $port in a new terminal..."

  # Detect OS and try to open in a new terminal window/tab
  case "$(uname -s)" in
    Darwin)
      # macOS: use AppleScript to open a new Terminal window/tab
      osascript <<OSA
        tell application "Terminal"
          activate
          do script "$command"
          set custom title of front window to "$service_name"
        end tell
OSA
      ;;
    Linux)
      # Linux: Try gnome-terminal, then xterm
      if command -v gnome-terminal &> /dev/null; then
        gnome-terminal --tab --title="$service_name" -- bash -c "$command; exec bash"
      elif command -v xterm &> /dev/null; then
        xterm -e "$command" &
      else
        echo "   Warning: No suitable terminal emulator found. Starting in current terminal."
        eval "$command" &
      fi
      ;;
    CYGWIN*|MINGW32*|MSYS*|MINGW*)
      # Windows (Git Bash/Cygwin): Use start command
      start bash -c "$command"
      ;;
    *)
      echo "   Warning: Unsupported OS. Starting in current terminal."
      eval "$command" &
      ;;
  esac
  sleep 2 # Give some time for the new terminal to open and command to execute
}

# Create a helper script for macOS to run commands in new terminal windows
cat << 'EOF' > scripts/run-in-terminal.sh
#!/bin/bash
osascript -e "tell application \"Terminal\" to do script \"$1\"" -e "tell application \"Terminal\" to set custom title of front window to \"$2\""
EOF
chmod +x scripts/run-in-terminal.sh

# 3. Start all application services
echo "3. Starting application services..."

start_service_in_new_terminal "Auth Service" 4002 "auth"
start_service_in_new_terminal "Profile Service" 4003 "profile"
start_service_in_new_terminal "Match Engine" 4004 "match-engine"
start_service_in_new_terminal "Conversation Service" 4005 "conversation"
start_service_in_new_terminal "Venue Service" 4006 "venue"
start_service_in_new_terminal "Voice Service" 4007 "voice"
start_service_in_new_terminal "Safety Service" 4008 "safety"
start_service_in_new_terminal "Frontend" 3000 "frontend"

echo ""
echo "   All application services initiated. Check new terminal windows/tabs."
echo ""

# 4. Instructions to check service status
echo "4. How to check if services are running:"
echo "   - Frontend: Open http://localhost:3000 in your web browser."
echo "   - Backend Services: Visit their health endpoints:"
echo "     - Auth Service: http://localhost:4002/health"
echo "     - Profile Service: http://localhost:4003/health"
echo "     - Match Engine: http://localhost:4004/health"
echo "     - Conversation Service: http://localhost:4005/health"
echo "     - Venue Service: http://localhost:4006/health"
echo "     - Voice Service: http://localhost:4007/health"
echo "     - Safety Service: http://localhost:4008/health"
echo ""

# 5. Instructions to stop all services
echo "5. To stop all services:"
echo "   - Close all the terminal windows/tabs that were opened by this script."
echo "   - Alternatively, run: pkill -f \"npm run dev\""
echo "   - To stop Docker containers: docker compose down"
echo ""

echo "--- Yeyzer AI Startup Script Finished ---"
echo "Please wait a moment for all services to fully initialize."
