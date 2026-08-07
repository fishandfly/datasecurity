#!/bin/sh
set -eu

cd /init
MARKER=/init/state/.v31-seeded
FORCE="$(printf '%s' "${FORCE_REINIT:-false}" | tr '[:upper:]' '[:lower:]')"

if [ "$FORCE" = "true" ] || [ "$FORCE" = "1" ] || [ "$FORCE" = "yes" ]; then
  echo "[init-data] FORCE_REINIT=true，强制执行 seed → migrate"
elif [ -f "$MARKER" ]; then
  echo "[init-data] 已存在初始化标记 ${MARKER}，跳过初始化"
  echo "[init-data] 如需重跑：删除 ${MARKER} 或设置 FORCE_REINIT=true"
  exit 0
fi

echo "[init-data] 安装初始化依赖（npm ci --omit=dev）..."
npm ci --omit=dev --no-audit --no-fund

echo "[init-data] 安装 pg 驱动（用于创建字典数据库视图）..."
npm install --no-save --no-audit --no-fund pg

echo "[init-data] 执行 bootstrap-base-collections.mjs（全新库自举基础集合）..."
node scripts/bootstrap-base-collections.mjs

echo "[init-data] 执行 seed-nocobase-demo.mjs ..."
node scripts/seed-nocobase-demo.mjs

echo "[init-data] 创建字典数据库视图（04-init-dictionary-views.sql）..."
node scripts/init-dictionary-views.mjs

echo "[init-data] 执行 migrate-nocobase-v3.mjs ..."
node scripts/migrate-nocobase-v3.mjs

mkdir -p /init/state
touch "$MARKER"
echo "[init-data] 初始化完成，标记已写入 ${MARKER}"
