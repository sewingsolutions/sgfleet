#!/usr/bin/env bash
set -euo pipefail

# ── Validate repo root ──────────────────────────────────────────────
if [[ ! -f docker-compose.yml ]]; then
  echo "Error: SGFleet repo root not found. Run this from the directory containing docker-compose.yml."
  exit 1
fi

# ── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Key order ────────────────────────────────────────────────────────
KEY_NAMES=(ADMIN_API_KEY SGFLEET_BASE_URL MODELS_DIR HUGGINGFACE_TOKEN PROMETHEUS_HOST)

# ── Load existing .env into associative array ────────────────────────
declare -A existing_values
declare -A has_key

load_existing() {
  [[ ! -f .env ]] && return 0
  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    local trimmed
    trimmed="$(echo "$raw_line" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')"
    [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue

    if [[ "$trimmed" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
      local k="${BASH_REMATCH[1]}"
      local v="${BASH_REMATCH[2]}"

      if [[ "$v" =~ ^\"(.*)\" ]]; then
        v="${BASH_REMATCH[1]}"
        v="${v//\\\"/\"}"
      elif [[ "$v" =~ ^\'(.*)\' ]]; then
        v="${BASH_REMATCH[1]}"
      else
        v="${v%%#*}"
        v="$(echo "$v" | xargs 2>/dev/null || true)"
      fi

      existing_values["$k"]="$v"
      has_key["$k"]=1
    fi
  done < .env
}

# ── Auto-generate admin key ──────────────────────────────────────────
generate_key() {
  printf 'sk-%s' "$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40)"
}

# ── Escape a value for safe .env double-quoting ──────────────────────
env_escape() {
  local v="$1"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  printf '%s' "$v"
}

# ── Prompt for a single key ──────────────────────────────────────────
declare -A result

prompt_key() {
  local name="$1"
  local desc default

  case "$name" in
    ADMIN_API_KEY)     desc="Admin API key (dashboard login)";;
    SGFLEET_BASE_URL)  desc="External gateway URL (used in generated configs)";;
    MODELS_DIR)        desc="Host directory for model files";;
    HUGGINGFACE_TOKEN) desc="HuggingFace API token (gated models)";;
    PROMETHEUS_HOST)   desc="Prometheus host (leave empty to disable metrics)";;
  esac

  case "$name" in
    MODELS_DIR)        default="/models";;
    SGFLEET_BASE_URL)  default="https://your-gateway-domain.example.com/v1";;
    *)                 default="";;
  esac

  if [[ "${has_key[$name]:-}" == "1" ]]; then
    local cur="${existing_values[$name]:-}"
    printf "\n${BOLD}%-26s${NC} (current: ${YELLOW}%s${NC})\n" "$desc" "$cur"
    while true; do
      read -rp "  [K]eep / [U]pdate / [R]emove? " c
      c="${c^^}"
      case "$c" in
        K) result["$name"]="$cur"; return 0 ;;
        U) ;; # fall through to prompt below
        R) result["$name"]=""; return 0 ;;
        *) echo "  Enter K, U, or R." ;;
      esac
    done
  fi

  echo ""

  if [[ "$name" == "ADMIN_API_KEY" ]]; then
    read -rp "  Auto-generate? [Y/n] " c
    c="${c^^}"
    if [[ "$c" == "Y" || -z "$c" ]]; then
      result["$name"]="$(generate_key)"
      return 0
    fi
    read -rp "  Enter key: " val
    result["$name"]="$val"
  elif [[ -n "$default" ]]; then
    read -rp "  $desc [$default]: " val
    result["$name"]="${val:-$default}"
  else
    read -rp "  $desc: " val
    result["$name"]="$val"
  fi
}

# ── Warn about dead keys ─────────────────────────────────────────────
warn_dead_keys() {
  local dk
  for dk in "SGFLEET_API_KEY" "MODEL_PROFILE"; do
    if [[ "${has_key[$dk]:-}" == "1" ]]; then
      echo -e "${YELLOW}⚠  Removing dead key: $dk (no longer used)${NC}"
    fi
  done
}

# ── Main ─────────────────────────────────────────────────────────────
echo -e "${BOLD}${BLUE}┌────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${BLUE}│           SGFleet Initial Setup                │${NC}"
echo -e "${BOLD}${BLUE}└────────────────────────────────────────────────┘${NC}"

load_existing

if [[ ${#has_key[@]} -gt 0 ]]; then
  ts="$(date +%Y%m%d%H%M%S)"
  cp .env ".env.backup.$ts"
  echo -e "\n${YELLOW}Existing .env detected - backed up to .env.backup.$ts${NC}"
  echo "For each key you can Keep, Update, or Remove the current value."
else
  echo -e "\n${GREEN}No .env found - collecting configuration values.${NC}"
fi

warn_dead_keys

for k in "${KEY_NAMES[@]}"; do
  prompt_key "$k"
done

# ── Write .env ───────────────────────────────────────────────────────
echo -e "\n${BOLD}Writing .env ...${NC}"

esc_admin="$(env_escape "${result[ADMIN_API_KEY]:-}")"
esc_base="$(env_escape "${result[SGFLEET_BASE_URL]:-}")"
esc_models="$(env_escape "${result[MODELS_DIR]:-}")"
esc_hf="$(env_escape "${result[HUGGINGFACE_TOKEN]:-}")"
esc_prom="$(env_escape "${result[PROMETHEUS_HOST]:-}")"

{
  echo "# SGFleet configuration"
  echo ""
  echo "# Admin"
  echo "ADMIN_API_KEY=\"${esc_admin}\""
  echo ""
  echo "# Gateway"
  echo "SGFLEET_BASE_URL=\"${esc_base}\""
  echo ""
  echo "# Models"
  echo "MODELS_DIR=\"${esc_models}\""
  echo "HUGGINGFACE_TOKEN=\"${esc_hf}\""
  echo ""
  echo "# Monitoring"
  if [[ -n "${result[PROMETHEUS_HOST]:-}" ]]; then
    echo "PROMETHEUS_HOST=\"${esc_prom}\""
  else
    echo '# PROMETHEUS_HOST=""  # omit to disable metrics export'
  fi
} > .env

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Setup complete.${NC}"
echo ""
echo -e "${BOLD}Configuration:${NC}"
echo -e "  SGFLEET_BASE_URL  ${BOLD}${result[SGFLEET_BASE_URL]:-<empty>}${NC}"
echo -e "  MODELS_DIR        ${BOLD}${result[MODELS_DIR]:-<empty>}${NC}"

if [[ -n "${result[HUGGINGFACE_TOKEN]:-}" ]]; then
  hf_short="${result[HUGGINGFACE_TOKEN]:0:8}"
  echo -e "  HUGGINGFACE_TOKEN ${BOLD}${hf_short}***${NC}"
else
  echo -e "  HUGGINGFACE_TOKEN ${BOLD}<not set>${NC}"
fi

if [[ -n "${result[PROMETHEUS_HOST]:-}" ]]; then
  echo -e "  PROMETHEUS_HOST   ${BOLD}${result[PROMETHEUS_HOST]}${NC}"
else
  echo -e "  PROMETHEUS_HOST   ${BOLD}<disabled>${NC}"
fi

echo ""
if [[ -n "${result[ADMIN_API_KEY]:-}" ]]; then
  echo -e "${RED}${BOLD}Save this ADMIN_API_KEY - it will not be shown again:${NC}"
  echo ""
  echo -e "   ${GREEN}${BOLD}${result[ADMIN_API_KEY]}${NC}"
  echo ""
fi

echo -e "${BOLD}Next steps:${NC}"
echo "  1. docker compose up -d"
echo "  2. Open http://<server>:8000/admin/login"
