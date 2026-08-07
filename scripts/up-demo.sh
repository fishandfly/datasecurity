#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-docker/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"

if [ ! -f "$ENV_FILE" ]; then
  if [ ! -f docker/.env.example ]; then
    echo "[up-demo] 缺少 docker/.env.example，无法生成环境文件" >&2
    exit 1
  fi
  echo "[up-demo] 未找到 ${ENV_FILE}，从 docker/.env.example 生成随机演示凭据"
  : > "$ENV_FILE"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*)
        echo "$line"
        ;;
      POSTGRES_PASSWORD=* | NOCOBASE_APP_KEY=* | SUBJECT_INTERNAL_A_SECRET=* | \
      SUBJECT_INTERNAL_B_SECRET=* | SUBJECT_EXTERNAL_C_SECRET=* | SUBJECT_DEMO_SECRET=*)
        echo "${line%%=*}=$(openssl rand -hex 32)"
        ;;
      NOCOBASE_ADMIN_PASSWORD=*)
        echo "${line%%=*}=$(openssl rand -hex 16)"
        ;;
      NOCOBASE_ADMIN_ACCOUNT=* | NOCOBASE_ADMIN_EMAIL=* | NOCOBASE_ADMIN_NICKNAME=* | \
      RUNTIME_ENFORCE_SOURCE_IP=* | FORCE_REINIT=*)
        echo "$line"
        ;;
      MYSQL_VALIDATION_PASSWORD=*)
        echo "MYSQL_VALIDATION_PASSWORD="
        ;;
      *)
        echo "$line"
        ;;
    esac
  done < docker/.env.example > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "[up-demo] 已生成 ${ENV_FILE}，请妥善保管（不会提交到 Git）"
fi

exec docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build "$@"
