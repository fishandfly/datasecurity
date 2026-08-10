#!/bin/sh
set -eu

cd /init
MARKER=/init/state/.v31-seeded
SCHEMA_MARKER=/init/state/.v31-schema-v2
FORCE="$(printf '%s' "${FORCE_REINIT:-false}" | tr '[:upper:]' '[:lower:]')"

if [ "$FORCE" = "true" ] || [ "$FORCE" = "1" ] || [ "$FORCE" = "yes" ]; then
  echo "[init-data] FORCE_REINIT=true，强制执行 seed → migrate"
  RUN_FULL_INIT=true
  SCHEMA_ONLY=false
elif [ -f "$MARKER" ]; then
  if [ -f "$SCHEMA_MARKER" ]; then
    echo "[init-data] 已存在初始化与 schema 标记，执行无损 schema 和审计列修复"
    RUN_FULL_INIT=false
    SCHEMA_ONLY=true
  else
    echo "[init-data] 检测到旧版初始化标记但缺少 ${SCHEMA_MARKER}，只执行 schema-only 迁移"
    RUN_FULL_INIT=false
    SCHEMA_ONLY=true
  fi
else
  RUN_FULL_INIT=true
  SCHEMA_ONLY=false
fi

echo "[init-data] 安装初始化依赖（npm ci --omit=dev）..."
npm ci --omit=dev --no-audit --no-fund

echo "[init-data] 安装 pg 驱动（用于创建字典数据库视图）..."
npm install --no-save --no-audit --no-fund pg

echo "[init-data] 修复供需集合审计字段配置..."
node scripts/repair-supply-demand-audit.mjs

echo "[init-data] 修复流式和供需表审计列兼容性..."
node scripts/repair-streaming-audit-columns.mjs

if [ "$RUN_FULL_INIT" = "true" ]; then
  echo "[init-data] 执行 bootstrap-base-collections.mjs（全新库自举基础集合）..."
  node scripts/bootstrap-base-collections.mjs

  echo "[init-data] 执行 seed-nocobase-demo.mjs ..."
  node scripts/seed-nocobase-demo.mjs

  echo "[init-data] 补齐 seed 创建的流式表审计列..."
  node scripts/repair-streaming-audit-columns.mjs

  echo "[init-data] 创建字典数据库视图（04-init-dictionary-views.sql）..."
  node scripts/init-dictionary-views.mjs
fi

echo "[init-data] 执行 migrate-nocobase-v3.mjs ..."
if [ "$SCHEMA_ONLY" = "true" ]; then
  MIGRATE_SCHEMA_ONLY=true node scripts/migrate-nocobase-v3.mjs
else
  node scripts/migrate-nocobase-v3.mjs
fi

mkdir -p /init/state
if [ "$RUN_FULL_INIT" = "true" ]; then
  touch "$MARKER"
  echo "[init-data] 初始化完成，标记已写入 ${MARKER}"
fi
touch "$SCHEMA_MARKER"
echo "[init-data] schema 迁移完成，标记已写入 ${SCHEMA_MARKER}"
