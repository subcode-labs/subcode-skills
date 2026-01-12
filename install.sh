#!/usr/bin/env bash
#
# Subcode Skills Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/install.sh | bash -s -- --yes
#
# Options:
#   --yes, -y    Headless mode: auto-accept all prompts, install all skills
#

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

REPO_URL="https://raw.githubusercontent.com/subcode-labs/subcode-skills/main"
SKILLS_DIR=".claude/skills"
SUBCODE_DIR=".subcode"

# Available skills (name:description)
AVAILABLE_SKILLS=(
  "subcode-worktrees:Git worktree management with best practices"
)

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

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y)
        HEADLESS=true
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
        error "Unknown option: $1"
        exit 1
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

  # Get repo root
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
    read -p "Install Bun now? [Y/n] " -n 1 -r
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

check_gum() {
  if command -v gum &>/dev/null; then
    HAS_GUM=true
    return 0
  fi

  HAS_GUM=false

  if [[ "$HEADLESS" == "true" ]]; then
    return 0  # Don't need gum in headless mode
  fi

  warn "gum not found (optional - provides fancy UI)"
  echo ""
  echo "Install gum for a better experience:"

  # Detect platform and show install command
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "  ${CYAN}brew install gum${NC}"
  elif command -v apt-get &>/dev/null; then
    echo -e "  ${CYAN}sudo mkdir -p /etc/apt/keyrings${NC}"
    echo -e "  ${CYAN}curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg${NC}"
    echo -e "  ${CYAN}echo \"deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *\" | sudo tee /etc/apt/sources.list.d/charm.list${NC}"
    echo -e "  ${CYAN}sudo apt update && sudo apt install gum${NC}"
  elif command -v pacman &>/dev/null; then
    echo -e "  ${CYAN}pacman -S gum${NC}"
  elif command -v dnf &>/dev/null; then
    echo -e "  ${CYAN}sudo dnf install gum${NC}"
  else
    echo -e "  ${CYAN}go install github.com/charmbracelet/gum@latest${NC}"
  fi

  echo ""
  echo -e "${DIM}Continuing with simple text UI...${NC}"
  echo ""
}

# =============================================================================
# Skill Selection
# =============================================================================

select_skills_gum() {
  local options=()
  for skill in "${AVAILABLE_SKILLS[@]}"; do
    local name="${skill%%:*}"
    local desc="${skill#*:}"
    options+=("$name - $desc")
  done

  echo -e "${BOLD}Select skills to install:${NC}"
  echo ""

  SELECTED_SKILLS=$(gum choose --no-limit --selected="${options[0]}" "${options[@]}" | cut -d' ' -f1)

  if [[ -z "$SELECTED_SKILLS" ]]; then
    warn "No skills selected"
    exit 0
  fi
}

select_skills_simple() {
  echo -e "${BOLD}Available skills:${NC}"
  echo ""

  local i=1
  for skill in "${AVAILABLE_SKILLS[@]}"; do
    local name="${skill%%:*}"
    local desc="${skill#*:}"
    echo -e "  ${CYAN}[$i]${NC} $name - $desc"
    ((i++))
  done

  echo ""
  echo -e "Enter skill numbers to install (space-separated), or ${CYAN}a${NC} for all:"
  read -r selection

  if [[ "$selection" == "a" || "$selection" == "A" ]]; then
    SELECTED_SKILLS=""
    for skill in "${AVAILABLE_SKILLS[@]}"; do
      SELECTED_SKILLS+="${skill%%:*}"$'\n'
    done
  else
    SELECTED_SKILLS=""
    for num in $selection; do
      if [[ $num =~ ^[0-9]+$ ]] && (( num >= 1 && num <= ${#AVAILABLE_SKILLS[@]} )); then
        local skill="${AVAILABLE_SKILLS[$((num-1))]}"
        SELECTED_SKILLS+="${skill%%:*}"$'\n'
      fi
    done
  fi

  SELECTED_SKILLS=$(echo "$SELECTED_SKILLS" | grep -v '^$')

  if [[ -z "$SELECTED_SKILLS" ]]; then
    warn "No valid skills selected"
    exit 0
  fi
}

select_skills_headless() {
  SELECTED_SKILLS=""
  for skill in "${AVAILABLE_SKILLS[@]}"; do
    SELECTED_SKILLS+="${skill%%:*}"$'\n'
  done
  SELECTED_SKILLS=$(echo "$SELECTED_SKILLS" | grep -v '^$')
  log "Headless mode: installing all skills"
}

select_skills() {
  if [[ "$HEADLESS" == "true" ]]; then
    select_skills_headless
  elif [[ "$HAS_GUM" == "true" ]]; then
    select_skills_gum
  else
    select_skills_simple
  fi
}

# =============================================================================
# Skill Installation
# =============================================================================

download_file() {
  local url="$1"
  local dest="$2"

  mkdir -p "$(dirname "$dest")"

  if curl -fsSL "$url" -o "$dest" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

install_skill() {
  local skill_name="$1"
  log "Installing skill: $skill_name"

  local skill_dir="$SKILLS_DIR/$skill_name"
  mkdir -p "$skill_dir/src" "$skill_dir/references"

  # Files to download for this skill
  local files=(
    "SKILL.md"
    "package.json"
    "src/init.ts"
    "src/create.ts"
    "src/remove.ts"
    "src/list.ts"
    "src/prune.ts"
    "references/worktree-patterns.md"
  )

  for file in "${files[@]}"; do
    local url="$REPO_URL/skills/$skill_name/$file"
    local dest="$skill_dir/$file"

    if download_file "$url" "$dest"; then
      echo -e "  ${DIM}Downloaded: $file${NC}"
    else
      warn "Failed to download: $file"
    fi
  done

  # Install dependencies
  if [[ -f "$skill_dir/package.json" ]]; then
    log "Installing skill dependencies..."
    (cd "$skill_dir" && bun install --silent)
  fi

  success "Installed: $skill_name"
}

# =============================================================================
# Subcode Directory Setup
# =============================================================================

setup_subcode_dir() {
  log "Setting up .subcode directory..."

  mkdir -p "$SUBCODE_DIR/worktrees"

  # Create .gitignore
  cat > "$SUBCODE_DIR/.gitignore" << 'EOF'
# Subcode managed files
worktrees/
*.log
.cache/
EOF

  # Create config.json if it doesn't exist
  if [[ ! -f "$SUBCODE_DIR/config.json" ]]; then
    local default_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")

    cat > "$SUBCODE_DIR/config.json" << EOF
{
  "\$schema": "https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/schemas/config.schema.json",
  "version": "1.0.0",
  "initialized": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "worktrees": {
    "defaultBaseBranch": "$default_branch",
    "autoInstallDeps": true,
    "copyEnvFiles": true,
    "packageManager": "auto"
  }
}
EOF
  fi

  success "Created .subcode directory"
}

# =============================================================================
# Post-Install Guidance
# =============================================================================

show_guidance() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Installation complete!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${BOLD}Installed skills:${NC}"
  echo "$SELECTED_SKILLS" | while read -r skill; do
    [[ -n "$skill" ]] && echo -e "  ${CYAN}$skill${NC}"
  done
  echo ""
  echo -e "${BOLD}Directory structure:${NC}"
  echo -e "  ${DIM}.subcode/${NC}           - Subcode configuration & data"
  echo -e "  ${DIM}.claude/skills/${NC}     - Installed Claude skills"
  echo ""
  echo -e "${BOLD}Using with Claude:${NC}"
  echo "  Just ask Claude to help with worktrees:"
  echo -e "  ${DIM}\"Create a new worktree for the auth feature\"${NC}"
  echo -e "  ${DIM}\"List my current worktrees\"${NC}"
  echo -e "  ${DIM}\"Remove the feature-auth worktree\"${NC}"
  echo ""
  echo -e "${BOLD}Manual commands:${NC}"
  echo -e "  ${CYAN}bun run .claude/skills/subcode-worktrees/src/create.ts --name <name>${NC}"
  echo -e "  ${CYAN}bun run .claude/skills/subcode-worktrees/src/list.ts${NC}"
  echo ""
  echo -e "${DIM}For more info: https://github.com/subcode-labs/subcode-skills${NC}"
  echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
  parse_args "$@"

  show_banner

  check_git_repo
  check_bun
  check_gum

  echo ""
  select_skills
  echo ""

  # Install selected skills
  echo "$SELECTED_SKILLS" | while read -r skill; do
    [[ -n "$skill" ]] && install_skill "$skill"
  done

  setup_subcode_dir
  show_guidance
}

main "$@"
