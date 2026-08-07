# 量测数据安全管控组件（数据中台安全管控 v3.1）

基于智能策略引擎的数据中台量测数据安全管控技术研究课题原型，包含：

- 管理门户（React + NocoBase）：数据资源、数据源、访问主体、访问策略、同态加密任务、日志与实时监控。
- 轻量安全运行服务（Python）：统一接入、数据 API、鉴权、策略、风险与日志回写。
- 密态计算服务（OpenFHE）：整数精确型（BFV）与浮点近似型（CKKS）求和、平均值。
- 演示环境：PostgreSQL 量测演示库（10 数据源 / 16 资源 / 21 主体 / 19+ API / 16+ 密钥）。

## 快速开始（Docker）

环境要求：Docker Engine 24+、Docker Compose v2、可访问 Docker Hub（含 `linux/amd64` 的 OpenFHE 镜像）。

```bash
git clone https://github.com/fishandfly/datasecurity.git
cd datasecurity
./scripts/up-demo.sh
```

首次启动会自动完成：

1. `postgres` 容器初始化量测演示库（`measurement_data` / `measurement_demo`）；
2. `app`（NocoBase）首次启动自动初始化数据库、创建管理员，并安装启用随仓库分发的 JC 基础插件（分类树 / 字典 / 配置中心 / 字段标签）；
3. `init-data` 一次性执行基础集合自举 → `seed-nocobase-demo.mjs` → 字典数据库视图 → `migrate-nocobase-v3.mjs`，写入全部演示数据；
4. `security-runtime` 与 `frontend` 在初始化完成后启动。

初始化标记位于 `docker/storage/init/.v31-seeded`；删除该文件或设置 `FORCE_REINIT=true` 可重新执行初始化。

## 访问入口

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 统一门户 | http://localhost:5173/data-catalog/ | 管理前端 |
| NocoBase 管理端 | http://localhost:8196 | 后台管理（调试入口） |
| 安全运行服务 | http://127.0.0.1:8090/health | 健康检查 |
| 密态计算服务 | http://127.0.0.1:8088/health | 健康检查 |

首次部署默认管理员为 `NOCOBASE_ADMIN_ACCOUNT`（默认 `nocobase`）/ `NOCOBASE_ADMIN_PASSWORD`（`up-demo.sh` 首次运行会生成随机值并写入 `docker/.env`）。正式环境请通过 `docker/.env` 修改全部密钥与管理员密码，并参考 `docs/安装部署/部署说明.md` 进行安全加固。

## 手动启动

```bash
cp docker/.env.example docker/.env
# 编辑 docker/.env，为每个密钥生成随机值
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d --build
```

`docker/.env` 已加入 `.gitignore`，不会提交到 Git。

## 常用命令

```bash
# 查看状态
docker compose --env-file docker/.env -f docker/docker-compose.yml ps

# 查看初始化日志
docker compose --env-file docker/.env -f docker/docker-compose.yml logs init-data

# 停止（保留数据）
docker compose --env-file docker/.env -f docker/docker-compose.yml stop
```
