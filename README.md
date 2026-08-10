# 电网数据安全管控平台

本仓库是“数据中台量测数据安全管控”课题的 React/NocoBase 演示实现，当前交付基线为 3.1。平台面向电力量测数据，覆盖数据接入、资源安全档案、标签与分层策略、访问主体授权、异常访问审计、密态计算和实时运行监控。

这是可运行的单机验证环境，不是生产级数据平台：演示库是本地生成数据，流式处理是单进程轻量实现，Compose 未提供集群、双活或异地容灾能力。

## 能力范围

- **安全管控门户**：登录、数据安全态势、实时运行监控（实时运行情况 / 分层策略流转 / 同态加密流转）、数据资源与详情、数据源配置、接入校验规则、标签目录/规则/记录、访问主体、行为基线、策略发布、决策审计、风险事件、四引擎日志中心、密态密钥/任务/结果/日志。
- **安全运行服务**：统一数据 API、API Key/HMAC 鉴权、主体 API 授权、资源级策略、标签硬约束、来源 IP、时间/区域/组织/行数/查询跨度/行为基线风险判断，以及决策和风险日志回写。
- **量测接入与流式处理**：数据库直连、已有 API、E 文件、消息服务四类接入通道；运行时支持量测档案、明细/脱敏/聚合输出。轻量流式引擎负责确定性事件注入、窗口聚合、异常检测和批次日志。
- **密态计算**：OpenFHE 适配服务提供 BFV 整数精确型、CKKS 浮点近似型，以及 `sum`、`mean` 两种聚合。输入最多 64 个数值，服务不保存明文数组。

## 架构

```text
浏览器
  │ /data-catalog/（Nginx 或 Vite）
  ▼
React 门户 ── /data-catalog-manage/api/ ──▶ NocoBase 管理服务
  │                                      │
  └──────── /data-api/ ──────────────────┼──▶ PostgreSQL（配置、审计、演示数据）
                                         │
                                         └──▶ 安全运行服务 ──▶ 受控量测源
                                                       └──────▶ OpenFHE
```

Compose 的服务为 `frontend`、`app`、`postgres`、`security-runtime`、`openfhe`，另有一次性 `init-data` 初始化容器。浏览器只应访问统一门户；运行时和 OpenFHE 默认绑定宿主机回环地址，OpenFHE 不提供浏览器直达代理。

## 目录

```text
src/pages/                  页面组件与页面测试
src/components/             通用 UI、图表、弹窗和表格
src/lib/                    认证、NocoBase/运行时客户端、数据映射和缓存
src/modules/                模块注册与路由（当前只注册 SecurityGovernance）
security-runtime-service/   FastAPI 安全运行服务及 Python 测试
openfhe-service/             OpenFHE BFV/CKKS 适配服务及测试
docker/                      Compose、Nginx、插件、物理库初始化和环境模板
scripts/                     NocoBase 自举、演示 seed、迁移和调用脚本
docs/                        部署、设计、测试用例和验收证据
```

## 快速启动（Docker）

环境要求：Docker Engine 24+、Docker Compose v2、Git、OpenSSL；构建前端/初始化脚本需要 Node.js 20。OpenFHE 镜像固定 `linux/amd64`，ARM 主机不作为性能验收基线。

```bash
git clone <仓库地址>
cd <项目目录>
./scripts/up-demo.sh
```

首次运行会：

1. 自动从 `docker/.env.example` 生成权限为 600 的随机 `docker/.env`；
2. 启动 PostgreSQL 和 NocoBase，安装并启用随仓库分发的 JC 基础插件；
3. 由 `init-data` 按 **基础集合自举 → seed → 字典视图 → migrate** 写入演示配置与量测数据；
4. 在依赖健康后启动安全运行服务、OpenFHE 和前端。

查看管理员账号和自动生成的密码：

```bash
grep -E '^(NOCOBASE_ADMIN_ACCOUNT|NOCOBASE_ADMIN_PASSWORD)=' docker/.env
```

不要把输出复制到文档、工单或提交记录。正式环境必须替换管理员密码和全部密钥。

手动启动：

```bash
cp docker/.env.example docker/.env
# 编辑 docker/.env，将尖括号占位符替换为随机值
chmod 600 docker/.env
docker compose --env-file docker/.env -f docker/docker-compose.yml config --quiet
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d --build
```

初始化标记为 `docker/storage/init/.v31-seeded`，当前 schema 迁移标记为 `docker/storage/init/.v31-schema-v2`。旧环境如果只有 `.v31-seeded`，下一次启动 `init-data` 会自动进入 schema-only 模式，先补齐流式表审计列、集合及字段，再执行迁移，不写入批量演示数据。演示环境需要完整重跑时，可删除两个标记或设置 `FORCE_REINIT=true` 后重新启动；已有业务数据禁止执行演示 seed 或删除 PostgreSQL 数据卷。

## 关键环境变量

变量模板位于 [`docker/.env.example`](docker/.env.example)。除端口和开关外，以下变量必须使用部署环境自己的随机值：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | 是 | NocoBase 管理库和演示数据源的数据库密码 |
| `NOCOBASE_APP_KEY` | 是 | NocoBase 应用密钥，至少 32 位，部署后不要随意更换 |
| `NOCOBASE_ADMIN_ACCOUNT` / `NOCOBASE_ADMIN_PASSWORD` | 是 | 首次启动管理员账号和密码；一键脚本会生成随机密码 |
| `NOCOBASE_ADMIN_EMAIL` / `NOCOBASE_ADMIN_NICKNAME` | 否 | 首次启动管理员资料 |
| `SUBJECT_INTERNAL_A_SECRET` / `SUBJECT_INTERNAL_B_SECRET` / `SUBJECT_EXTERNAL_C_SECRET` | 是 | 验收主体的 API 凭据 |
| `SUBJECT_DEMO_SECRET` | 是 | 客户应用演示主体共用的演示凭据 |
| `MYSQL_VALIDATION_PASSWORD` | 否 | MySQL 验证数据源密码，未接入时可留空 |
| `RUNTIME_ENFORCE_SOURCE_IP` | 否 | 是否强制来源 IP 白名单；验证环境默认 `false`，准生产建议 `true` |
| `FORCE_REINIT` | 否 | 是否强制重跑 `init-data`，默认 `false`，只用于可丢弃演示环境 |

端口变量 `FRONTEND_PORT`、`NOCOBASE_PORT`、`SECURITY_RUNTIME_PORT`、`OPENFHE_PORT` 可覆盖默认端口。不要把不带 `--quiet` 的 Compose 完整配置输出贴到工单，解析后的配置可能包含密钥。

## 访问入口

| 服务 | 默认地址 | 用途 |
| --- | --- | --- |
| 统一门户 | `http://localhost:5173/data-catalog/` | 用户登录和安全管控页面 |
| NocoBase 管理端 | `http://localhost:8196` | 管理/迁移调试入口，应限制给运维人员 |
| 安全运行服务 | `http://127.0.0.1:8090/health` | 健康检查和受控运行 API |
| OpenFHE | `http://127.0.0.1:8088/health` | 密态计算健康检查 |

端口可通过 `FRONTEND_PORT`、`NOCOBASE_PORT`、`SECURITY_RUNTIME_PORT`、`OPENFHE_PORT` 覆盖。PostgreSQL 不映射到宿主机。生产部署请参考 [`docs/安装部署/部署说明.md`](docs/安装部署/部署说明.md)，在统一 HTTPS 入口后限制管理端和内部服务。

## 本地前端开发

```bash
npm ci
npm run dev
```

Vite 使用 `/data-catalog/` 基址，并将 `/api`、`/data-catalog-manage/api`、`/data-api` 和 `/security-runtime-api` 代理到本机服务。运行时代理目标可用 `VITE_SECURITY_RUNTIME_PROXY_TARGET` 覆盖。前端默认从 NocoBase 读取真实数据；仅在独立 UI 预览时显式设置 `VITE_PORTAL_DEMO_FALLBACK_ENABLED=true`，不得用回退数据冒充运行指标、日志或策略结果。

常用前端开关包括：`VITE_PORTAL_ACCESS_MODE`（`auth` 或 `demo-auto`）、`VITE_PORTAL_PASSWORD_LOGIN_ENABLED`、`VITE_PORTAL_AI_ASSISTANT_ENABLED`、`VITE_PRODUCT_SOLUTION` 和 NocoBase API 地址相关变量。含凭据的变量只能通过未提交的环境文件或部署平台 Secret 注入。

## 常用命令

```bash
# 容器状态与日志
docker compose --env-file docker/.env -f docker/docker-compose.yml ps
docker compose --env-file docker/.env -f docker/docker-compose.yml logs -f init-data

# 旧数据卷升级：补齐当前版本 schema（不会删除 PostgreSQL 数据）
docker compose --env-file docker/.env -f docker/docker-compose.yml run --rm init-data

# 停止（保留数据）
docker compose --env-file docker/.env -f docker/docker-compose.yml stop

# 前端校验
npm run typecheck
npm run build
npm test

# 服务端测试
python -m pytest security-runtime-service/tests -q
python -m pytest openfhe-service/tests -q

# 单次受控数据 API 调用（密钥仅从环境变量读取）
SUBJECT_SECRET='***' node scripts/call-v3-data-api.mjs \
  http://127.0.0.1:8090/data-api/resources/<api-path> \
  <subject-code> <scenario>

# 生成客户应用演示调用与真实决策日志
SUBJECT_DEMO_SECRET='***' node scripts/generate-customer-calls.mjs
```

运行调用脚本时不要把示例中的 `***` 当作真实值，也不要在 shell 历史中留下明文密钥。数据 API 的完整签名规则和错误码见 [`security-runtime-service/README.md`](security-runtime-service/README.md)。

## 演示数据基线

`seed-nocobase-demo.mjs` 与 `migrate-nocobase-v3.mjs` 设计为幂等脚本，执行顺序必须是 `seed → migrate`。2026-08-05 的 3.1 快照包含：

| 对象 | 数量 |
| --- | ---: |
| 数据源 | 10 |
| 数据资源 | 16 |
| 访问主体/数据应用 | 21 |
| API 资源 | 20（已发布 14） |
| 启用密态密钥 | 16 |

决策日志、风险事件、接入日志和密态任务会随演示调用、连接检查和流式引擎持续变化，不应在页面或文档中写死为业务事实。详细基线、TC01-TC13 和验收证据见 [`docs/design v3.1/测试用例/README.md`](docs/design%20v3.1/测试用例/README.md)。

## 安全边界与限制

- `.env`、主体凭据、数据源凭据和 NocoBase `APP_KEY` 不得提交；数据库只保存凭据引用。
- 生产环境应使用只读数据源账号、网络白名单、HTTPS/TLS（必要时 mTLS）、日志留存和备份策略；当前 Compose 不替代现场安全设备。
- OpenFHE 只实现 BFV/CKKS、`sum`/`mean` 最小能力，不能据此宣称通用密态计算平台。
- 流式引擎为单进程演示实现，事件注入是可复现的演示语义，不等价于真实消息中间件吞吐。
- 页面允许展示业务化演示名称，不应暴露客户真实表名、内部 URL、密钥或虚构的生产规模。

## 相关文档

- [`docs/安装部署/部署说明.md`](docs/安装部署/部署说明.md)：主机要求、端口、配置、初始化、升级和安全加固。
- [`docs/design v3.0/INDEX.md`](docs/design%20v3.0/INDEX.md)：3.0 总体设计、数据模型、页面交互和运行链路。
- [`docs/design v3.1/INDEX.md`](docs/design%20v3.1/INDEX.md)：客户资料对齐、实时监控、流式引擎和测试计划。
- [`src/modules/README.md`](src/modules/README.md)：前端模块契约和当前注册状态。
- [`security-runtime-service/README.md`](security-runtime-service/README.md)、[`openfhe-service/README.md`](openfhe-service/README.md)：两个 Python 服务的接口与约束。
