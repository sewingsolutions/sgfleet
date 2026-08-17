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

# ── Host requirement checks ─────────────────────────────────────────
check_host_requirements() {
  echo -e "${BOLD}Checking host requirements...${NC}"
  local failed=0

  # Docker
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}  ✗ docker not found${NC}"
    failed=1
  else
    echo -e "  ${GREEN}✓ docker${NC}"
  fi

  # Docker Compose
  if ! docker compose version &> /dev/null; then
    echo -e "${RED}  ✗ docker compose not found${NC}"
    failed=1
  else
    echo -e "  ${GREEN}✓ docker compose${NC}"
  fi

  # nvidia-smi
  if ! command -v nvidia-smi &> /dev/null; then
    echo -e "${YELLOW}  ⚠ nvidia-smi not found — GPU access will not be available${NC}"
  else
    if ! nvidia-smi &> /dev/null; then
      echo -e "${RED}  ✗ nvidia-smi failed — GPU drivers may not be installed${NC}"
      failed=1
    else
      echo -e "  ${GREEN}✓ nvidia-smi${NC}"
    fi
  fi

  # nvidia-ctk (NVIDIA Container Toolkit)
  if ! command -v nvidia-ctk &> /dev/null; then
    echo -e "${YELLOW}  ⚠ nvidia-ctk not found — NVIDIA Container Toolkit may not be installed${NC}"
    echo -e "     Docker containers may not be able to access GPUs."
    echo -e "     Install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
  else
    echo -e "  ${GREEN}✓ nvidia-ctk${NC}"
  fi

  # openssl
  if ! command -v openssl &> /dev/null; then
    echo -e "${RED}  ✗ openssl not found — required for encryption key generation${NC}"
    failed=1
  else
    echo -e "  ${GREEN}✓ openssl${NC}"
  fi

  if [[ $failed -eq 1 ]]; then
    echo -e "\n${RED}${BOLD}Host requirements not met. Please fix the issues above and try again.${NC}"
    exit 1
  fi
}

# ── Load existing .env into associative array ────────────────────────
declare -A existing_values
declare -A has_key
HAS_EXISTING_VARS=0

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
        v="$(echo "$v" | xargs 2> /dev/null || true)"
      fi

      existing_values["$k"]="$v"
      has_key["$k"]=1
      HAS_EXISTING_VARS=1
    fi
  done < .env
}

# ── Escape a value for safe .env double-quoting ──────────────────────
env_escape() {
  local v="$1"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  printf '%s' "$v"
}

# ── Prompt for infrastructure values ─────────────────────────────────
declare -A result

prompt_infra() {
  local name="$1"
  local desc default

  case "$name" in
    MODELS_DIR)
      desc="Host directory for model files"
      default="/models"
      ;;
    DATA_DIR)
      desc="Host directory for data files"
      default="./data"
      ;;
    LOGS_DIR)
      desc="Host directory for log files"
      default="./logs"
      ;;
    SGFLEET_BASE_URL)
      desc="External gateway URL (CORS, callbacks)"
      default="https://your-gateway-domain.example.com/v1"
      ;;
    PROMETHEUS_HOST)
      desc="Prometheus host (omit to disable metrics)"
      default=""
      ;;
  esac

  # Check for existing value
  if [[ -v has_key["$name"] ]]; then
    local cur="${existing_values[$name]:-}"
    printf "\n${BOLD}%-26s${NC} (current: ${YELLOW}%s${NC})\n" "$desc" "$cur"
    while true; do
      read -rp "  [K]eep / [U]pdate / [R]emove? " c
      c="${c^^}"
      case "$c" in
        K)
          result["$name"]="$cur"
          return 0
          ;;
        U) ;; # fall through to prompt below
        R)
          result["$name"]=""
          return 0
          ;;
        *) echo "  Enter K, U, or R." ;;
      esac
    done
  fi

  echo ""
  read -rp "  $desc [$default]: " val
  result["$name"]="${val:-$default}"
}

# ── Detect machine IP ────────────────────────────────────────────────
detect_ip() {
  local ip=""
  if command -v hostname &> /dev/null; then
    ip="$(hostname -I 2> /dev/null | awk '{print $1}' || true)"
  fi
  if [[ -z "$ip" ]] && command -v ip &> /dev/null; then
    ip="$(ip route get 1 2> /dev/null | awk '{print $NF; exit}' || true)"
  fi
  if [[ -z "$ip" ]]; then
    ip="localhost"
  fi
  echo "$ip"
}

# ── Main ─────────────────────────────────────────────────────────────
echo -e "${BOLD}${BLUE}┌────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${BLUE}│           SGFleet Initial Setup                │${NC}"
echo -e "${BOLD}${BLUE}└────────────────────────────────────────────────┘${NC}"

# Step 1: Host checks
check_host_requirements

# Step 2: Load existing .env
load_existing
if [[ $HAS_EXISTING_VARS -eq 1 ]]; then
  echo -e "\n${YELLOW}Existing .env detected — you can keep, update, or remove values.${NC}"
fi

# Step 3: Prompt for infrastructure values
echo ""
echo -e "${BOLD}Infrastructure configuration:${NC}"
prompt_infra "MODELS_DIR"
prompt_infra "DATA_DIR"
prompt_infra "LOGS_DIR"
prompt_infra "SGFLEET_BASE_URL"
prompt_infra "PROMETHEUS_HOST"

# Step 4: Auto-generate values
echo -e "\n${BOLD}Generating secure values...${NC}"
if [[ -n "${existing_values[SGFLEET_ENCRYPTION_KEY]:-}" ]]; then
  SGFLEET_ENCRYPTION_KEY="${existing_values[SGFLEET_ENCRYPTION_KEY]}"
  echo -e "  ${GREEN}✓ Kept existing Encryption Key${NC}"
else
  SGFLEET_ENCRYPTION_KEY="$(openssl rand -hex 32)"
  echo -e "  ${GREEN}✓ Generated new Encryption Key${NC}"
fi

# HOST_MODELS_DIR defaults to MODELS_DIR
HOST_MODELS_DIR="${result[MODELS_DIR]:-/models}"

# Step 5: Create host directories
echo -e "\n${BOLD}Creating host directories...${NC}"
models_dir="${result[MODELS_DIR]:-/models}"
data_dir="${result[DATA_DIR]:-./data}"
logs_dir="${result[LOGS_DIR]:-./logs}"

mkdir -p "$models_dir" && echo -e "  ${GREEN}✓ $models_dir${NC}"
mkdir -p "$data_dir" && echo -e "  ${GREEN}✓ $data_dir${NC}"
mkdir -p "$logs_dir" && echo -e "  ${GREEN}✓ $logs_dir${NC}"

# Step 6: Write .env
echo -e "\n${BOLD}Writing .env ...${NC}"
esc_base="$(env_escape "${result[SGFLEET_BASE_URL]:-}")"
esc_models="$(env_escape "$models_dir")"
esc_host_models="$(env_escape "$HOST_MODELS_DIR")"
esc_data="$(env_escape "$data_dir")"
esc_logs="$(env_escape "$logs_dir")"
esc_enc="$(env_escape "$SGFLEET_ENCRYPTION_KEY")"
esc_prom="$(env_escape "${result[PROMETHEUS_HOST]:-}")"

{
  echo "# SGFleet configuration — infrastructure only"
  echo "# Secrets are managed via the web UI after first boot"
  echo ""
  echo "# Host directories"
  echo "MODELS_DIR=\"${esc_models}\""
  echo "HOST_MODELS_DIR=\"${esc_host_models}\""
  echo "DATA_DIR=\"${esc_data}\""
  echo "LOGS_DIR=\"${esc_logs}\""
  echo ""
  echo "# Network"
  echo "SGFLEET_BASE_URL=\"${esc_base}\""
  echo ""
  echo "# Encryption"
  echo "SGFLEET_ENCRYPTION_KEY=\"${esc_enc}\""
  echo ""
  echo "# Monitoring"
  if [[ -n "${result[PROMETHEUS_HOST]:-}" ]]; then
    echo "PROMETHEUS_HOST=\"${esc_prom}\""
  else
    echo '# PROMETHEUS_HOST=""  # omit to disable metrics export'
  fi

  echo ""
  echo "# Custom user variables (preserved from previous .env)"
  if [[ $HAS_EXISTING_VARS -eq 1 ]]; then
    for k in "${!existing_values[@]}"; do
      # Skip the keys we already explicitly manage above
      if [[ "$k" != "MODELS_DIR" && "$k" != "HOST_MODELS_DIR" && "$k" != "DATA_DIR" && "$k" != "LOGS_DIR" && "$k" != "SGFLEET_BASE_URL" && "$k" != "SGFLEET_ENCRYPTION_KEY" && "$k" != "PROMETHEUS_HOST" ]]; then
        echo "${k}=\"${existing_values[$k]}\""
      fi
    done
  fi
} > .env

# Step 7: Generate models.json
if [[ ! -f models.json && -d "$models_dir" ]]; then
  echo -e "\n${BOLD}${BLUE}Scanning for models in ${models_dir} ...${NC}"

  dirs=()
  while IFS= read -r -d '' entry; do
    dirs+=("$(basename "$entry")")
  done < <(find "$models_dir" -mindepth 1 -maxdepth 1 -type d -print0 2> /dev/null | sort -z)

  if [[ ${#dirs[@]} -eq 0 ]]; then
    echo -e "${YELLOW}  No model directories found. Run init.sh again after placing models.${NC}"
  else
    plural="y"
    [[ ${#dirs[@]} -ne 1 ]] && plural="ies"
    echo "  Found ${#dirs[@]} director${plural}: $(
      IFS=', '
      echo "${dirs[*]}"
    )"

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

      entry_json=$(
        cat << MODELEOF
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
      cat > models.json << EOF
{
  "models": [
  ${model_entries}
  ]
}
EOF
      ap="y"
      [[ added_count -ne 1 ]] && ap="ies"
      echo -e "\n${GREEN}Wrote models.json with ${added_count} model entrie${ap}.${NC}"
    fi
  fi
elif [[ -f models.json ]]; then
  echo -e "\n${YELLOW}models.json already exists — skipping.${NC}"
fi

# Step 8: Launch Docker Compose
echo -e "\n${BOLD}Launching Docker Compose...${NC}"
if [[ -n "${result[PROMETHEUS_HOST]:-}" ]]; then
  docker compose --profile monitoring up -d
  echo -e "  ${GREEN}✓ Started with metrics export${NC}"
else
  docker compose up -d
  echo -e "  ${GREEN}✓ Started (metrics export disabled)${NC}"
fi

# Step 9: Print summary with IP
setup_ip="$(detect_ip)"

echo -e "\n${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  Setup complete! First-boot wizard ready.    ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Complete setup in your browser:${NC}"
echo -e "  ${BLUE}http://${setup_ip}:8000${NC}"
echo ""
echo -e "${BOLD}Configuration:${NC}"
echo -e "  SGFLEET_BASE_URL  ${BOLD}${result[SGFLEET_BASE_URL]:-<empty>}${NC}"
echo -e "  MODELS_DIR        ${BOLD}${models_dir}${NC}"
echo -e "  DATA_DIR          ${BOLD}${data_dir}${NC}"
echo -e "  LOGS_DIR          ${BOLD}${logs_dir}${NC}"
if [[ -n "${result[PROMETHEUS_HOST]:-}" ]]; then
  echo -e "  PROMETHEUS_HOST   ${BOLD}${result[PROMETHEUS_HOST]}${NC}"
else
  echo -e "  PROMETHEUS_HOST   ${BOLD}<disabled>${NC}"
fi
