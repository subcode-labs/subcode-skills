#!/usr/bin/env bash

# Subcode Tunnel Management Script
# Creates public URLs for local dev servers using Tailscale Funnel or Cloudflare Tunnels
#
# Usage: tunnel.sh <command> [args]
# Commands: detect, start, stop, stop-all, list, find-port

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${HOME}/.subcode/tunnels"
CLOUDFLARED_CONFIG_DIR="${HOME}/.cloudflared"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[tunnel]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1" >&2; }

# Ensure state directory exists
mkdir -p "$STATE_DIR"

# =============================================================================
# Detection Functions
# =============================================================================

# Get machine name for tunnel naming
get_machine_name() {
  # Check env var first
  if [[ -n "${TUNNEL_MACHINE_NAME:-}" ]]; then
    echo "$TUNNEL_MACHINE_NAME"
    return
  fi

  # Try Tailscale hostname
  if command -v tailscale &>/dev/null; then
    local ts_name
    ts_name=$(tailscale status --json 2>/dev/null | jq -r '.Self.HostName // empty' 2>/dev/null || true)
    if [[ -n "$ts_name" ]]; then
      echo "$ts_name"
      return
    fi
  fi

  # Fallback to system hostname
  hostname -s 2>/dev/null || echo "dev"
}

# Check if Tailscale is available and working
check_tailscale() {
  if ! command -v tailscale &>/dev/null; then
    echo "not_installed"
    return
  fi

  local status
  status=$(tailscale status --json 2>/dev/null | jq -r '.BackendState // "unknown"' 2>/dev/null || echo "error")

  if [[ "$status" == "Running" ]]; then
    echo "ready"
  elif [[ "$status" == "NeedsLogin" ]]; then
    echo "needs_login"
  else
    echo "not_connected"
  fi
}

# Check if Cloudflare is available
check_cloudflare() {
  if ! command -v cloudflared &>/dev/null; then
    echo "not_installed"
    return
  fi

  # Check if authenticated (has origin cert)
  if cloudflared tunnel list &>/dev/null 2>&1; then
    echo "authenticated"
  else
    echo "not_authenticated"
  fi
}

# Get Cloudflare domain from environment
get_cloudflare_domain() {
  echo "${CLOUDFLARE_TUNNEL_DOMAIN:-}"
}

# Check which Tailscale funnel ports are available
get_available_tailscale_ports() {
  local available=()
  local ts_host
  ts_host=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' 2>/dev/null | sed 's/\.$//' || true)

  if [[ -z "$ts_host" ]]; then
    echo "[]"
    return
  fi

  # Check current funnel config
  local funnel_config
  funnel_config=$(tailscale funnel status --json 2>/dev/null || echo '{}')

  for port in 443 8443 10000; do
    # Check if this port is already configured for funnel
    if ! echo "$funnel_config" | jq -e ".\"$ts_host:$port\" // .\"$ts_host\"" &>/dev/null 2>&1; then
      available+=("$port")
    fi
  done

  # Always include 443 as it can be reconfigured
  if [[ ${#available[@]} -eq 0 ]]; then
    available=(443 8443 10000)
  fi

  printf '%s\n' "${available[@]}" | jq -R . | jq -s .
}

# =============================================================================
# Tunnel Management Functions
# =============================================================================

# Find the next available port starting from base
find_available_port() {
  local base_port="$1"
  local port="$base_port"
  local max_port=$((base_port + 100))

  while [[ $port -lt $max_port ]]; do
    if ! ss -tlnp 2>/dev/null | grep -q ":$port " && \
       ! lsof -i ":$port" &>/dev/null 2>&1; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done

  error "No available port found in range $base_port-$max_port"
  return 1
}

# Start a Tailscale funnel
start_tailscale_funnel() {
  local local_port="$1"
  local name="$2"
  local funnel_port="${3:-443}"

  log "Starting Tailscale funnel for port $local_port..."

  # Get the Tailscale hostname
  local ts_host
  ts_host=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' 2>/dev/null | sed 's/\.$//' || true)

  if [[ -z "$ts_host" ]]; then
    error "Could not determine Tailscale hostname"
    return 1
  fi

  # Start the funnel (may need sudo)
  if sudo tailscale funnel --bg --https="$funnel_port" "$local_port" 2>/dev/null; then
    local url="https://${ts_host}"
    if [[ "$funnel_port" != "443" ]]; then
      url="${url}:${funnel_port}"
    fi

    # Save state
    echo "{\"method\":\"tailscale\",\"name\":\"$name\",\"local_port\":$local_port,\"funnel_port\":$funnel_port,\"url\":\"$url\",\"ts_host\":\"$ts_host\"}" > "$STATE_DIR/${name}.json"

    success "Tailscale funnel created!"
    echo "$url"
    return 0
  else
    error "Failed to start Tailscale funnel (may need sudo)"
    return 1
  fi
}

# Start a Cloudflare quick tunnel (no auth needed)
start_cloudflare_quick() {
  local local_port="$1"
  local name="$2"

  log "Starting Cloudflare quick tunnel for port $local_port..."

  # Start cloudflared in background and capture output
  local log_file="$STATE_DIR/${name}.log"
  cloudflared tunnel --url "http://localhost:$local_port" > "$log_file" 2>&1 &
  local pid=$!

  # Wait for URL to appear in output
  local max_wait=30
  local waited=0
  local url=""

  while [[ $waited -lt $max_wait ]]; do
    if [[ -f "$log_file" ]]; then
      url=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' "$log_file" 2>/dev/null | head -1 || true)
      if [[ -n "$url" ]]; then
        break
      fi
    fi
    sleep 1
    waited=$((waited + 1))
  done

  if [[ -z "$url" ]]; then
    kill "$pid" 2>/dev/null || true
    error "Failed to get tunnel URL"
    cat "$log_file" 2>/dev/null || true
    return 1
  fi

  # Save state
  echo "{\"method\":\"cloudflare_quick\",\"name\":\"$name\",\"local_port\":$local_port,\"url\":\"$url\",\"pid\":$pid}" > "$STATE_DIR/${name}.json"

  success "Cloudflare quick tunnel created!"
  echo "$url"
  return 0
}

# Start a Cloudflare named tunnel
start_cloudflare_named() {
  local local_port="$1"
  local name="$2"
  local machine_name
  machine_name=$(get_machine_name)

  local domain="${CLOUDFLARE_TUNNEL_DOMAIN:-}"

  if [[ -z "$domain" ]]; then
    error "CLOUDFLARE_TUNNEL_DOMAIN environment variable is required for named tunnels"
    error "Set it to your Cloudflare domain, e.g.: export CLOUDFLARE_TUNNEL_DOMAIN=yourdomain.com"
    return 1
  fi

  local tunnel_name="${CLOUDFLARE_TUNNEL_NAME:-$machine_name}"
  local hostname="${name}-${machine_name}.${domain}"

  log "Starting Cloudflare named tunnel for port $local_port -> $hostname..."

  # Check if tunnel exists, create if not
  if ! cloudflared tunnel list 2>/dev/null | grep -q "^[^ ]* *$tunnel_name "; then
    log "Creating tunnel '$tunnel_name'..."
    cloudflared tunnel create "$tunnel_name" || {
      error "Failed to create tunnel"
      return 1
    }
  fi

  # Get tunnel ID
  local tunnel_id
  tunnel_id=$(cloudflared tunnel list --output json 2>/dev/null | jq -r ".[] | select(.name==\"$tunnel_name\") | .id" || true)

  if [[ -z "$tunnel_id" ]]; then
    error "Could not find tunnel ID for '$tunnel_name'"
    return 1
  fi

  # Create DNS route if it doesn't exist
  if ! cloudflared tunnel route dns "$tunnel_name" "$hostname" 2>/dev/null; then
    log "DNS route may already exist, continuing..."
  fi

  # Find credentials file
  local creds_file="$CLOUDFLARED_CONFIG_DIR/${tunnel_id}.json"
  if [[ ! -f "$creds_file" ]]; then
    error "Credentials file not found: $creds_file"
    return 1
  fi

  # Create/update config file
  local config_file="$STATE_DIR/${tunnel_name}-config.yml"

  # Read existing config or start fresh
  if [[ -f "$config_file" ]]; then
    # Add new ingress rule
    local temp_config=$(mktemp)
    # Use yq if available, otherwise rebuild
    if command -v yq &>/dev/null; then
      yq eval "del(.ingress[] | select(.hostname == \"$hostname\"))" "$config_file" > "$temp_config"
      yq eval ".ingress = [{\"hostname\": \"$hostname\", \"service\": \"http://localhost:$local_port\"}] + .ingress" "$temp_config" > "$config_file"
      rm "$temp_config"
    else
      # Rebuild config manually
      cat > "$config_file" << EOF
tunnel: $tunnel_name
credentials-file: $creds_file

ingress:
  - hostname: $hostname
    service: http://localhost:$local_port
EOF
      # Preserve other hostnames - this is simplified, may need improvement
    fi
  else
    cat > "$config_file" << EOF
tunnel: $tunnel_name
credentials-file: $creds_file

ingress:
  - hostname: $hostname
    service: http://localhost:$local_port
  - service: http_status:404
EOF
  fi

  # Check if tunnel is already running
  local existing_pid
  existing_pid=$(pgrep -f "cloudflared.*tunnel.*run.*$tunnel_name" 2>/dev/null || true)

  if [[ -n "$existing_pid" ]]; then
    # Tunnel running - need to restart to pick up new config
    log "Restarting tunnel to apply new configuration..."
    kill "$existing_pid" 2>/dev/null || true
    sleep 2
  fi

  # Start tunnel
  local log_file="$STATE_DIR/${tunnel_name}.log"
  cloudflared tunnel --config "$config_file" run "$tunnel_name" > "$log_file" 2>&1 &
  local pid=$!

  # Wait for connection
  sleep 5

  if ! kill -0 "$pid" 2>/dev/null; then
    error "Tunnel process died. Check log: $log_file"
    cat "$log_file" 2>/dev/null | tail -20
    return 1
  fi

  local url="https://$hostname"

  # Save state
  echo "{\"method\":\"cloudflare_named\",\"name\":\"$name\",\"local_port\":$local_port,\"url\":\"$url\",\"hostname\":\"$hostname\",\"tunnel_name\":\"$tunnel_name\",\"pid\":$pid}" > "$STATE_DIR/${name}.json"

  success "Cloudflare named tunnel created!"
  echo "$url"
  return 0
}

# Stop a tunnel by name
stop_tunnel() {
  local name="$1"
  local state_file="$STATE_DIR/${name}.json"

  if [[ ! -f "$state_file" ]]; then
    warning "No tunnel found with name: $name"
    return 0
  fi

  local method
  method=$(jq -r '.method' "$state_file")

  case "$method" in
    tailscale)
      local funnel_port
      funnel_port=$(jq -r '.funnel_port' "$state_file")
      log "Stopping Tailscale funnel on port $funnel_port..."
      sudo tailscale funnel --https="$funnel_port" off 2>/dev/null || true
      ;;
    cloudflare_quick)
      local pid
      pid=$(jq -r '.pid' "$state_file")
      log "Stopping Cloudflare quick tunnel (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
      ;;
    cloudflare_named)
      local tunnel_name hostname
      tunnel_name=$(jq -r '.tunnel_name' "$state_file")
      hostname=$(jq -r '.hostname' "$state_file")
      log "Removing $hostname from tunnel $tunnel_name..."
      # For named tunnels, we don't stop the whole tunnel, just remove this route
      # The tunnel may serve other hostnames
      ;;
  esac

  rm -f "$state_file"
  success "Tunnel '$name' stopped"
}

# Stop all tunnels
stop_all_tunnels() {
  log "Stopping all tunnels..."

  # Stop Tailscale funnels
  sudo tailscale funnel reset 2>/dev/null || true

  # Stop Cloudflare processes
  pkill -f "cloudflared tunnel" 2>/dev/null || true

  # Clean state files
  rm -f "$STATE_DIR"/*.json 2>/dev/null || true

  success "All tunnels stopped"
}

# List active tunnels
list_tunnels() {
  echo ""
  echo "Active Tunnels"
  echo "=============="

  local found=false

  for state_file in "$STATE_DIR"/*.json; do
    [[ -f "$state_file" ]] || continue
    found=true

    local name method url local_port
    name=$(jq -r '.name' "$state_file")
    method=$(jq -r '.method' "$state_file")
    url=$(jq -r '.url' "$state_file")
    local_port=$(jq -r '.local_port' "$state_file")

    echo ""
    echo -e "${CYAN}$name${NC}"
    echo "  Method: $method"
    echo "  Local:  http://localhost:$local_port"
    echo "  Public: $url"
  done

  if [[ "$found" == "false" ]]; then
    echo ""
    echo "No active tunnels"
  fi

  echo ""
}

# =============================================================================
# Commands
# =============================================================================

cmd_detect() {
  local tailscale_status cloudflare_status machine_name
  tailscale_status=$(check_tailscale)
  cloudflare_status=$(check_cloudflare)
  machine_name=$(get_machine_name)

  local result
  result=$(cat << EOF
{
  "machine_name": "$machine_name",
  "tailscale": {
    "status": "$tailscale_status",
    "ready": $([ "$tailscale_status" = "ready" ] && echo "true" || echo "false")
  },
  "cloudflare": {
    "status": "$cloudflare_status",
    "authenticated": $([ "$cloudflare_status" = "authenticated" ] && echo "true" || echo "false"),
    "domain": "$(get_cloudflare_domain)"
  },
  "recommended": "$(
    if [[ "$cloudflare_status" == "authenticated" ]] && [[ -n "$(get_cloudflare_domain)" ]]; then
      echo "cloudflare_named"
    elif [[ "$tailscale_status" == "ready" ]]; then
      echo "tailscale"
    else
      echo "cloudflare_quick"
    fi
  )"
}
EOF
)
  echo "$result" | jq .
}

cmd_start() {
  local port="${1:-}"
  local name="${2:-}"
  local method=""

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --method=*)
        method="${1#*=}"
        shift
        ;;
      *)
        if [[ -z "$port" ]]; then
          port="$1"
        elif [[ -z "$name" ]]; then
          name="$1"
        fi
        shift
        ;;
    esac
  done

  if [[ -z "$port" ]]; then
    error "Usage: tunnel.sh start <port> [name] [--method=tailscale|cloudflare|cloudflare_quick]"
    exit 1
  fi

  # Default name based on port
  name="${name:-app-$port}"

  # Auto-detect method if not specified
  if [[ -z "$method" ]]; then
    local detection
    detection=$(cmd_detect)
    method=$(echo "$detection" | jq -r '.recommended')
    log "Auto-selected method: $method"
  fi

  # Verify port is listening
  if ! ss -tlnp 2>/dev/null | grep -q ":$port "; then
    warning "Nothing is listening on port $port"
    echo "Make sure your dev server is running first"
  fi

  case "$method" in
    tailscale)
      start_tailscale_funnel "$port" "$name"
      ;;
    cloudflare|cloudflare_named)
      start_cloudflare_named "$port" "$name"
      ;;
    cloudflare_quick|quick)
      start_cloudflare_quick "$port" "$name"
      ;;
    *)
      error "Unknown method: $method"
      echo "Available methods: tailscale, cloudflare, cloudflare_quick"
      exit 1
      ;;
  esac
}

cmd_stop() {
  local name="${1:-}"

  if [[ -z "$name" ]]; then
    error "Usage: tunnel.sh stop <name>"
    exit 1
  fi

  stop_tunnel "$name"
}

cmd_stop_all() {
  stop_all_tunnels
}

cmd_list() {
  list_tunnels
}

cmd_find_port() {
  local base_port="${1:-3000}"
  find_available_port "$base_port"
}

# =============================================================================
# Main
# =============================================================================

main() {
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    detect)
      cmd_detect "$@"
      ;;
    start)
      cmd_start "$@"
      ;;
    stop)
      cmd_stop "$@"
      ;;
    stop-all)
      cmd_stop_all "$@"
      ;;
    list)
      cmd_list "$@"
      ;;
    find-port)
      cmd_find_port "$@"
      ;;
    *)
      echo "Subcode Tunnel - Create public URLs for local dev servers"
      echo ""
      echo "Usage: tunnel.sh <command> [args]"
      echo ""
      echo "Commands:"
      echo "  detect              Check available tunneling methods"
      echo "  start <port> [name] Create a tunnel to a local port"
      echo "  stop <name>         Stop a tunnel"
      echo "  stop-all            Stop all tunnels"
      echo "  list                List active tunnels"
      echo "  find-port <base>    Find next available port"
      echo ""
      echo "Options for 'start':"
      echo "  --method=<method>   Force a specific method:"
      echo "                      tailscale, cloudflare, cloudflare_quick"
      echo ""
      echo "Environment variables:"
      echo "  TUNNEL_MACHINE_NAME       Override machine name for URLs"
      echo "  CLOUDFLARE_TUNNEL_DOMAIN  Domain for Cloudflare tunnels (required for named tunnels)"
      echo "  CLOUDFLARE_TUNNEL_NAME    Tunnel name (default: machine name)"
      ;;
  esac
}

main "$@"
