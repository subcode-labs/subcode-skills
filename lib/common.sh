#!/usr/bin/env bash
#
# Subcode Common Shell Utilities
#
# Source this file in other scripts:
#   source "$(dirname "$0")/../lib/common.sh"
#

# =============================================================================
# Colors
# =============================================================================

export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export BOLD='\033[1m'
export DIM='\033[2m'
export NC='\033[0m'

# =============================================================================
# Output Functions
# =============================================================================

log() {
  echo -e "${BLUE}[info]${NC} $1"
}

success() {
  echo -e "${GREEN}[ok]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[warn]${NC} $1"
}

error() {
  echo -e "${RED}[error]${NC} $1" >&2
}

# =============================================================================
# Platform Detection
# =============================================================================

detect_platform() {
  local platform="unknown"

  if [[ "$OSTYPE" == "darwin"* ]]; then
    platform="macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if grep -qi microsoft /proc/version 2>/dev/null; then
      platform="wsl"
    else
      platform="linux"
    fi
  elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    platform="windows"
  fi

  echo "$platform"
}

# =============================================================================
# Package Manager Detection
# =============================================================================

detect_package_manager() {
  local dir="${1:-.}"

  if [[ -f "$dir/bun.lockb" ]]; then
    echo "bun"
  elif [[ -f "$dir/pnpm-lock.yaml" ]]; then
    echo "pnpm"
  elif [[ -f "$dir/yarn.lock" ]]; then
    echo "yarn"
  elif [[ -f "$dir/package-lock.json" ]]; then
    echo "npm"
  else
    echo "bun"  # Default to bun
  fi
}

# =============================================================================
# Git Helpers
# =============================================================================

is_git_repo() {
  git rev-parse --is-inside-work-tree &>/dev/null
}

get_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

get_current_branch() {
  git symbolic-ref --short HEAD 2>/dev/null
}

get_default_branch() {
  # Try to detect default branch from remote
  local default=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')

  if [[ -z "$default" ]]; then
    # Fall back to common defaults
    if git show-ref --verify --quiet refs/heads/main 2>/dev/null; then
      default="main"
    elif git show-ref --verify --quiet refs/heads/master 2>/dev/null; then
      default="master"
    else
      default="main"
    fi
  fi

  echo "$default"
}

# =============================================================================
# Gum Wrappers (with fallbacks)
# =============================================================================

has_gum() {
  command -v gum &>/dev/null
}

# Prompt for confirmation
# Usage: confirm "Are you sure?" && do_something
confirm() {
  local prompt="${1:-Continue?}"

  if has_gum; then
    gum confirm "$prompt"
  else
    read -p "$prompt [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
  fi
}

# Prompt for input
# Usage: result=$(input "Enter name:" "default")
input() {
  local prompt="${1:-Enter value:}"
  local default="${2:-}"

  if has_gum; then
    gum input --placeholder "$default" --prompt "$prompt "
  else
    local result
    read -p "$prompt [$default] " result
    echo "${result:-$default}"
  fi
}

# Choose from options
# Usage: result=$(choose "Option 1" "Option 2" "Option 3")
choose() {
  if has_gum; then
    gum choose "$@"
  else
    local i=1
    for opt in "$@"; do
      echo "  [$i] $opt" >&2
      ((i++))
    done
    read -p "Select [1]: " num >&2
    num="${num:-1}"
    if [[ $num =~ ^[0-9]+$ ]] && (( num >= 1 && num <= $# )); then
      echo "${!num}"
    else
      echo "$1"
    fi
  fi
}

# =============================================================================
# JSON Helpers (using jq or basic parsing)
# =============================================================================

has_jq() {
  command -v jq &>/dev/null
}

# Get JSON value
# Usage: value=$(json_get '{"key": "value"}' '.key')
json_get() {
  local json="$1"
  local path="$2"

  if has_jq; then
    echo "$json" | jq -r "$path"
  else
    # Very basic fallback - only works for simple top-level keys
    local key="${path#.}"
    echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed 's/.*: *"\([^"]*\)".*/\1/'
  fi
}
