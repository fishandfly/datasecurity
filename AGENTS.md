# Repository Guidelines

## 项目定位

本仓库是“数据中台量测数据安全管控”课题的 3.1 演示实现，目录名中的 `v2.0` 是工作区名称，不代表当前运行版本。当前门户注册表只启用 `security-governance` 模块；其他业务模块目录保留的是历史页面/兼容源码，不得在默认导航或模块注册表中重新启用，除非需求明确要求。

核心闭环是：React 门户 → NocoBase 配置与审计数据 → 轻量 Python 安全运行服务 → 受控数据源 / OpenFHE 密态计算服务。演示数据来自本地 PostgreSQL，不代表生产数据。

## 目录与职责

```text
src/
  main.tsx, App.tsx       React 入口、BrowserRouter、全局 Suspense
  layouts/                门户头部、导航、主题、AI 浮窗等页面编排
  modules/                模块契约、注册表和按模块拆分的路由
  pages/                  页面组件与页面级回归测试
  components/             跨页面 UI、图表、弹窗和表格组件
  lib/                    NocoBase 客户端、认证、运行时 API、数据映射、缓存和纯函数
  assets/                 打包所需的图片和静态资源
security-runtime-service/
  app/                    FastAPI 运行时、授权/策略/取数、流式处理和数据源连接
  tests/                  Python 单元测试
openfhe-service/
  app/                    BFV/CKKS 同态聚合适配服务
  tests/                  OpenFHE API 与约束测试
docker/
  docker-compose.yml      当前五容器编排
  frontend/               Nginx 静态站点与反向代理
  app/                    NocoBase 启动包装脚本和随仓库分发的插件
  v3.0/initdb/            演示物理库 SQL 与字典视图
scripts/                  NocoBase 自举、演示数据、迁移和调用脚本
docs/
  安装部署/               部署与安全加固说明
  design v3.0/, design v3.1/ 设计、测试用例和验收证据
```

`dist/`、`node_modules/`、`docker/storage/`、`tmp/`、`.pytest_cache/` 和本地 `docker/.env` 都是生成或本地文件，不应手工修改或提交。

## 运行与构建

环境基线为 Node.js 20、Docker Engine 24+、Docker Compose v2、OpenSSL；OpenFHE 镜像固定 `linux/amd64`。仓库提交了 `package-lock.json`，日常使用 npm；不要在同一变更中混用 npm/pnpm 并生成另一套 lockfile。

```bash
npm ci                         # 安装前端与初始化脚本依赖
npm run dev                    # Vite，默认 http://localhost:5173/data-catalog/
npm run typecheck              # tsc -b，仅类型检查
npm run build                  # 类型检查并生成 dist/
npm test                       # Node 内置测试，执行 src/**/*.test.mjs
```

服务端测试：

```bash
python -m pytest security-runtime-service/tests -q
python -m pytest openfhe-service/tests -q
```

Docker 端到端验证应使用 `docker compose --env-file docker/.env -f docker/docker-compose.yml ...`，先检查 `config --quiet`，再检查容器健康状态和三个健康接口。提交前至少运行 `npm run typecheck`、`npm run build` 及受影响的测试；当前工作区的 `npm test` 可能包含历史模块/导航断言，失败时先判断测试是否仍描述当前路由，再决定同步测试或修复代码。

## Docker 初始化与服务边界

推荐 `./scripts/up-demo.sh`。首次运行会从 `docker/.env.example` 生成权限为 600 的随机 `docker/.env`，然后执行 Compose 构建启动。初始化顺序固定为：

```text
postgres → app（NocoBase 安装和插件启用）→ init-data（bootstrap → seed → 字典视图 → migrate）
postgres + app + init-data + openfhe → security-runtime → frontend
```

`init-data` 使用 `docker/storage/init/.v31-seeded` 标记演示数据已写入，使用 `docker/storage/init/.v31-schema-v2` 标记当前 schema 已迁移；只有两个标记都存在时才跳过。旧数据卷缺少 schema 标记时进入 schema-only 模式，只执行幂等 schema/元数据迁移，不写入批量演示数据。只有在可丢弃的演示环境中才删除标记或设置 `FORCE_REINIT=true`。已有数据库不得重跑演示 seed，更不能删除 `docker/storage/db/postgres`；生产数据应通过审核后的管理操作或迁移包建立。

运行时职责和安全边界：

- `security-runtime` 的数据 API 依次执行主体鉴权（API Key 或 HMAC）→ 主体 API 授权 → 已发布策略匹配 → IP/时间/范围/行数/行为风险判断 → 数据访问，并回写决策、风险、接入和密态任务日志。
- `security-runtime` 内置轻量流式引擎：确定性事件注入、60 秒窗口聚合、异常检测和批次落库；它是演示级单进程能力，不宣称 Kafka/Flink 级吞吐或高可用。
- `openfhe` 只接受 BFV/CKKS 的 `sum`/`mean`，最多 64 个数值样本；只由 `security-runtime` 触发，浏览器不得直连。明文数值不得写入任务表、日志或前端响应。
- 主体和数据源密钥只从 `SUBJECT_SECRETS_JSON`、`SOURCE_SECRETS_JSON` 注入，数据库只存 `secret_ref`；禁止把密钥写入源码、文档、截图或命令历史。

默认端口：前端 `5173`、NocoBase `8196`、运行时 `127.0.0.1:8090`、OpenFHE `127.0.0.1:8088`；PostgreSQL 仅容器网络可见。准生产部署必须将 NocoBase 管理端限制到本机/运维网段，由外部 HTTPS 入口提供 TLS、访问控制和审计，并按部署文档评估 `RUNTIME_ENFORCE_SOURCE_IP=true`。

## 前端开发约束

- 路由基址固定为 `/data-catalog`，新增页面应在对应 `src/modules/<Module>/routes.tsx` 注册，并使用现有懒加载和 `RequireAuth` 结构。
- 页面编排放在 `src/pages`，跨页面数据请求与转换放在 `src/lib`；优先复用现有 NocoBase 客户端、UI 组件、Lucide 图标和 CSS 变量。
- 首页指标、日志、桑基图和资源记录必须来自真实后端集合/API。空态、错误态优先于伪造运行数据；演示回退只能显式开启 `VITE_PORTAL_DEMO_FALLBACK_ENABLED`，不能默认启用。
- 保持两空格缩进、单引号、无分号；组件/导出类型使用 PascalCase，Hook 使用 `use...`，文件使用 kebab-case。用户可见文案不得泄露基础设施产品名、凭据、内部 URL、真实客户表名或真实规模。
- 修改公共布局、导航、数据映射、认证或运行时契约时，补充相邻的 `*.test.mjs`/Python 测试；不要为了通过旧断言恢复已下线模块。

## 提交与安全

提交标题使用简短、祈使式中文，例如 `修复接入日志详情抽屉`。提交前检查 `git diff` 和 `git status`，不要提交 `.env`、备份、数据库导出物、`dist/`、依赖缓存或无关改动。生产/准生产部署、数据初始化、密态计算和密钥变更必须同时更新对应的 `docs/安装部署/` 或 `docs/design v3.1/` 说明和验证证据。

设计资料中的 `docs/design v2.0/paraflow/` 是只读参考，不直接修改；新增设计应链接到当前实现和验收用例。
