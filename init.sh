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
KEY_NAMES=(ADMIN_API_KEY SGFLEET_BASE_URL MODELS_DIR HOST_MODELS_DIR HUGGINGFACE_TOKEN PROMETHEUS_HOST)

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
    HOST_MODELS_DIR)   desc="Host path used for spawned model container binds (leave empty to reuse MODELS_DIR)";;
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

# ── Generate models.json ──────────────────────────────────────────────
models_dir="${result[MODELS_DIR]:-/models}"

if [[ ! -f models.json && -d "$models_dir" ]]; then
  echo -e "\n${BOLD}${BLUE}Scanning for models in ${models_dir} ...${NC}"

  dirs=()
  while IFS= read -r -d '' entry; do
    dirs+=("$(basename "$entry")")
  done < <(find "$models_dir" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null | sort -z)

  if [[ ${#dirs[@]} -eq 0 ]]; then
    echo -e "${YELLOW}  No model directories found. Run init.sh again after placing models.${NC}"
  else
    plural="y"
    [[ ${#dirs[@]} -ne 1 ]] && plural="ies"
    echo "  Found ${#dirs[@]} director${plural}: $(IFS=', '; echo "${dirs[*]}")"

    model_entries=""
    first=true
    active_first=true
    added_count=0

    for d in "${dirs[@]}"; do
      read -rp "  Add ${BOLD}${d}${NC} as a model? [Y/n/a] " c
      c="${c,,}"
      if [[ "$c" == "a" ]]; then
        echo "  Skipping remaining directories."
        break
      fi
      if [[ "$c" == "n" ]]; then
        continue
      fi

      slug="$(echo "$d" | tr -cs '[:alnum:]-' '-' | tr '[:upper:]' '[:lower:]' | sed 's/^-//;s/-$//')"
      container_id="sgfleet-${slug}"
      active_val="false"
      if $active_first; then
        active_val="true"
        active_first=false
      fi

      echo "  ${GREEN}+ ${d} (id: ${slug}, active: ${active_val})${NC}"
      added_count=$((added_count + 1))

      entry_json=$(cat <<MODELEOF
    {
      "id": "${slug}",
      "name": "${d}",
      "image": "lmsysorg/sglang:v0.5.16",
      "model_path": "/models/${d}",
      "context_length": 131072,
      "max_output_length": 8192,
      "port": 30000,
      "container_name": "${container_id}",
      "container_alias": "${container_id}",
      "model_alias": "sgfleet-api-model",
      "active": ${active_val},
      "grace_period": 10,
      "environment": {
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        "SGLANG_ALLOW_OVERWRITE_LONGER_CONTEXT_LEN": "1",
        "SGLANG_USE_BREAKABLE_CUDA_GRAPH": "true"
      },
      "gpu": "auto",
      "command_flags": [
        "--context-length", "131072",
        "--kv-cache-dtype", "fp8_e4m3",
        "--mem-fraction-static", "0.90",
        "--chunked-prefill-size", "8192",
        "--enable-metrics",
        "--enable-flashinfer"
      ]
    }
MODELEOF
)

      if $first; then
        model_entries="  ${entry_json}"
        first=false
      else
        model_entries="${model_entries},
  ${entry_json}"
      fi
    done

    if [[ -n "$model_entries" ]]; then
      cat > models.json <<EOF
{
  "models": [
  ${model_entries}
  ]
}
EOF
      ap="y"; [[ added_count -ne 1 ]] && ap="ies"
      echo -e "\n${GREEN}Wrote models.json with ${added_count} model entrie${ap}.${NC}"
    fi
  fi
elif [[ -f models.json ]]; then
  echo -e "\n${YELLOW}models.json already exists — skipping.${NC}"
  echo "  To regenerate, remove models.json and run init.sh again.${NC}"
fi

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
