#!/usr/bin/env bash
#
# Subcode Skills Bootstrap Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/install.sh | bash -s -- --yes
#
# This script bootstraps the subcode CLI by ensuring Bun is installed,
# then running the CLI via bunx.
#

set -euo pipefail

# =============================================================================
# Colors and Output
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log() { echo -e "${BLUE}[info]${NC} $1"; }
success() { echo -e "${GREEN}[ok]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1" >&2; }

# =============================================================================
# ASCII Art Banner
# =============================================================================

show_banner() {
  echo -e "${CYAN}"
  cat << 'EOF'
           _                    _
 ___ _   _| |__   ___ ___   __| | ___
/ __| | | | '_ \ / __/ _ \ / _` |/ _ \
\__ \ |_| | |_) | (_| (_) | (_| |  __/
|___/\__,_|_.__/ \___\___/ \__,_|\___|

EOF
  echo -e "${NC}${DIM}        skills installer v0.1.0${NC}"
  echo ""
}

# =============================================================================
# Argument Parsing
# =============================================================================

HEADLESS=false
EXTRA_ARGS=""

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y)
        HEADLESS=true
        EXTRA_ARGS="--yes"
        shift
        ;;
      --help|-h)
        echo "Usage: install.sh [--yes|-y]"
        echo ""
        echo "Options:"
        echo "  --yes, -y    Headless mode: auto-accept all prompts"
        exit 0
        ;;
      *)
        shift
        ;;
    esac
  done
}

# =============================================================================
# Dependency Checks
# =============================================================================

check_git_repo() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    error "Not inside a git repository. Please run this from your project root."
    exit 1
  fi

  REPO_ROOT=$(git rev-parse --show-toplevel)
  cd "$REPO_ROOT"
  success "Git repository detected: $REPO_ROOT"
}

check_bun() {
  if command -v bun &>/dev/null; then
    local version=$(bun --version)
    success "Bun found: v$version"
    return 0
  fi

  warn "Bun is not installed (required for subcode skills)"

  if [[ "$HEADLESS" == "true" ]]; then
    log "Installing Bun automatically (headless mode)..."
    install_bun
  else
    echo ""
    echo -e "${BOLD}Bun is required to run subcode skills.${NC}"
    echo ""
    read -p "Install Bun now? [Y/n] " -n 1 -r < /dev/tty
    echo ""

    if [[ $REPLY =~ ^[Nn]$ ]]; then
      echo ""
      echo "To install Bun manually:"
      echo -e "  ${CYAN}curl -fsSL https://bun.sh/install | bash${NC}"
      echo ""
      exit 1
    fi

    install_bun
  fi
}

install_bun() {
  log "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash

  # Source bun in current shell
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if command -v bun &>/dev/null; then
    success "Bun installed successfully"
  else
    error "Bun installation failed. Please install manually:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    exit 1
  fi
}

# =============================================================================
# Main
# =============================================================================

main() {
  parse_args "$@"

  show_banner

  check_git_repo
  check_bun

  echo ""
  log "Running subcode CLI..."
  echo ""

  # Run the CLI via bunx
  # Note: Replace with actual npm package name once published
  # For now, this assumes the package is published as 'subcode'
  bunx subcode init $EXTRA_ARGS
}

main "$@"
