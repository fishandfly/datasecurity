# 电网数据安全管控完整体测试用例

## 1. 目的

本目录将小样本配置验收与执行引擎新逻辑合并，按“配置 -> 发布 -> 鉴权 -> 标签补全 -> 分类分级 -> 动态策略 -> 安全动作 -> 审计记录”顺序验证完整链路。访问日志统一为“完整版日志”，只在数据资源详情页和日志中心呈现。

本套用例只使用当前小样本，不执行全量演示种子脚本。拒绝访问只保留完整版审计日志，不生成风险事件，也不验证通知、消息、工单或人工处置。

## 2. 当前基线

| 对象 | 数量/配置 |
| --- | --- |
| 数据源 | 1：`SRC-YC20-001` |
| 数据资源 | 5：用户侧十五分钟负荷曲线、调度实时运行量测、低频电压曲线、日冻结电能示值、客户电能示值曲线 |
| 防护层 | L1=1、L2=2、L3=2 |
| API 记录 | 6（当前 5 条 `enabled/success`，1 条草稿保留） |
| 访问主体 | 3：`APP-INTERNAL-A`、`APP-INTERNAL-B`、`APP-EXTERNAL-C` |
| 访问策略 | 10 条启用策略 |
| 分类标签 | 10 个 |
| 字段安全档案 | 50 条 |
| 同态能力 | BFV、CKKS；密钥仅保存 Secret 引用 |

L1 区域负荷 API 使用 `/internal/region-hourly` 受控聚合执行通道，不能使用未执行安全动作的直连转发。

## 3. 环境与安全约定

前端使用本机 Vite：`http://localhost:5173/data-catalog/`。后端使用 Docker 的 `security-runtime`、`postgres`、`openfhe` 服务，地址分别为 `http://127.0.0.1:8090`、数据库容器、`http://127.0.0.1:8088`。

```bash
set -a
. docker/.env
set +a
docker compose --env-file docker/.env -f docker/docker-compose.yml ps
curl -fsS http://127.0.0.1:8090/health
curl -fsS http://127.0.0.1:8088/health
```

通用 HMAC 调用，不要输出或保存密钥：

```bash
SUBJECT_SECRET="$SUBJECT_INTERNAL_A_SECRET" API_AUTH_MODE=hmac \
node scripts/call-v3-data-api.mjs '<请求 URL>' APP-INTERNAL-A '<场景>'
```

代表请求（密钥只从环境变量读取）：

| 输出 | URL | 主体/场景 |
| --- | --- | --- |
| 明细 | `/data-api/internal/active-power?regionCode=REGION-A&startAt=2026-07-01T00%3A00%3A00%2B08%3A00&endAt=2026-07-01T01%3A00%3A00%2B08%3A00` | `APP-INTERNAL-A / dispatch-operation-analysis` |
| 脱敏 | `/data-api/resources/grid-lvf-volt-001?pageSize=3` | `APP-INTERNAL-A / online-grid-lvf-voltage` |
| 聚合 | `/data-api/direct/region-load?regionCode=REGION-A&startAt=2026-07-01T00%3A00%3A00%2B08%3A00&endAt=2026-07-01T04%3A00%3A00%2B08%3A00` | `APP-INTERNAL-A / region-load-query` |
| BFV | `/data-api/resources/cust-daily-energy-003?operation=sum&fieldCode=PAP_R&regionCode=REGION-A&startAt=2026-06-25T00%3A00%3A00%2B08%3A00&endAt=2026-06-26T00%3A00%3A00%2B08%3A00` | `APP-INTERNAL-B / marketing-2-daily-energy` |
| CKKS | `/data-api/resources/cust-power-curve-005?operation=mean&fieldCode=VALUE&regionCode=REGION-A&startAt=2026-07-01T08%3A00%3A00%2B08%3A00&endAt=2026-07-01T09%3A00%3A00%2B08%3A00` | `APP-INTERNAL-B / marketing-2-energy-curve` |
| 跨域 BFV | `/data-api/resources/cust-daily-energy-003?operation=sum&fieldCode=PAP_R&regionCode=REGION-A&startAt=2026-06-25T00%3A00%3A00%2B08%3A00&endAt=2026-06-26T00%3A00%3A00%2B08%3A00` | `APP-EXTERNAL-C / cross-domain-encrypted` |

调用后将响应中的 `requestId` 代入审计 SQL，不在证据中保存 HMAC 输出中的敏感请求头。

状态变更用例必须记录原值、在用例结束前恢复。禁止执行 `seed-nocobase-demo.mjs`、`migrate-nocobase-v3.mjs`、`generate-customer-calls.mjs`，禁止将密码、Token、签名、数据库导出或明文数值写入证据。

## 4. 审计判定

每次请求必须在 `security_policy_decision_logs` 留一条记录。`applied_limits_json` 顶层必须包含：`labelEnrichment`、`classification`、`dynamicPolicy`、`securityActions`、`hardConstraints` 和 `runtimeTrace`。`runtimeTrace` 固定按 `label_enrichment -> classification -> dynamic_policy -> security_action -> audit_record` 排列；同时 `security-runtime` 容器输出一条同 `requestId` 的 `security_api_access` 结构化日志。

完整版日志必须同时提供：标签补全后的完整标签与字段标签、候选策略逐条的通过/未命中/不通过结果及原因、数据源 -> 数据资源 -> 数据应用 -> API -> 输出路径的访问链路。标签展示按“分类组 -> 标签项”嵌套缩进，分类组为父级、每个标签为子级，并用层级线区分，避免把不同分类混成一行。日志中心支持按数据源、数据应用、数据资源查询；历史连接日志、策略日志、流式运行日志和同态任务日志仅保留作历史兼容数据，不再单独汇总到日志中心。旧的接入日志、调用与决策日志、同态日志入口统一重定向到完整版日志中心；资源详情只保留访问策略完整版日志。

任何拒绝均只写一条包含完整证据的决策日志；不创建 `security_risk_events`，不要求通知或人工处置。

## 5. 用例清单

| 编号 | 用例 | 覆盖范围 |
| --- | --- | --- |
| CT01 | 环境、服务与小样本基线 | 容器、健康、1/5/5/3/10/10（API 总记录 6） |
| CT02 | 数据源配置与 Secret 引用 | 数据源连接、密码不落库 |
| CT03 | 资源、字段与分类标签配置 | 字段档案、L1/L2/L3、10 标签 |
| CT04 | API 路由与运行时配置 | 发布状态、字段映射、执行路径 |
| CT05 | 主体鉴权与动态策略配置 | HMAC、主体/API/场景、时间区域行数规则 |
| CT06 | 标签补全与分类分级执行 | 实时快照、硬约束、自动隔离 |
| CT07 | 动态策略多因素拒绝 | 场景、时间、区域、行数、行为 |
| CT08 | 安全动作真实输出 | detail、masked、aggregate、BFV、CKKS |
| CT09 | 不可执行受控路由阻断 | 直连隔离、禁止原样转发 |
| CT10 | 审计日志完整性 | 日志证据与拒绝原因 |
| CT11 | 监控、日志中心与流式空态 | 页面可观测性、空数据降级 |
| CT12 | 安全红线与交付回归 | 密钥/明文/真实表名扫描、自动化回归 |
| CT13 | API 运行时统一管控日志 | 五阶段轨迹、结构化服务日志、前端可见性 |

## 6. 推荐执行顺序

严格按 `CT01 -> CT13` 执行；CT07、CT09、CT10、CT13 会产生拒绝审计日志，不要清理，它们是验收证据。密态调用必须串行执行。
