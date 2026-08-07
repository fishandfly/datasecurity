#!/bin/sh
set -eu

cd /app/nocobase

echo "[app-init] 执行 NocoBase 前置初始化（postinstall / db:auth / instance-id / nginx）..."
yarn nocobase postinstall
yarn nocobase db:auth
yarn nocobase generate-instance-id
yarn nocobase create-nginx-conf

if command -v nginx >/dev/null 2>&1; then
  rm -f /etc/nginx/conf.d/nocobase.conf
  ln -s /app/nocobase/storage/nocobase.conf /etc/nginx/conf.d/nocobase.conf
  nginx
  echo "[app-init] nginx 已启动"
fi

is_installed() {
  node -e '
    const { Client } = require("pg")
    const client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    })
    client.connect()
      .then(() => client.query("select to_regclass($1) as t", ["public.\"applicationPlugins\""]))
      .then((result) => {
        console.log(result.rows[0] && result.rows[0].t ? "yes" : "no")
        return client.end()
      })
      .catch((error) => {
        console.error(`db check failed: ${error.message}`)
        process.exit(1)
      })
  '
}

if [ "$(is_installed)" != "yes" ]; then
  echo "[app-init] 首次启动：初始化 NocoBase 数据库..."
  node node_modules/.bin/nocobase install
fi

for tgz in /plugins/*.tgz; do
  [ -e "$tgz" ] || continue
  echo "[app-init] 安装插件 $(basename "$tgz") ..."
  node node_modules/.bin/nocobase pm add "$tgz"
done

for name in \
  @jcbase/plugin-category-tree-jc \
  @jcbase/plugin-dictionary-jc \
  @jcbase/plugin-config-center-jc \
  @jcbase/plugin-field-tags-jc; do
  echo "[app-init] 启用插件 ${name} ..."
  node node_modules/.bin/nocobase pm enable "$name"
done

exec yarn start --quickstart
