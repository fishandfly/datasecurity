# TC05 数据服务与 API

## 1. 用例信息

| 项目 | 内容 |
| --- | --- |
| 用例编号 | TC05 |
| 用例名称 | 数据服务（默认 API）生成、发布与上下线 |
| 验证目标 | 验证"资源 → 唯一默认 API"契约、量测档案驱动运行时配置、发布/下线真实生效 |
| 对应需求 | 研究内容 3"量测数据安全管控组件"的数据服务形态；四视角"数据服务" |
| 优先级 | 高 |
| 执行角色 | 数据管理员 / API 管理员 |
| 测试入口 | 数据资源详情 → API 信息 tab；组件配置 |

## 用户故事

> 作为 API 管理员，我希望资源定义好之后自动形成唯一查询 API，避免路径、字段、参数重复录入，并能真实上下线控制服务可用性。

## 2. 验收范围

1. 每个资源有且仅有一个默认 API（编码 `API-{资源编码}`、路径 `/data-api/resources/{编码小写}`）。
2. API 的运行时量测档案（`runtime_config_json`）由资源定义自动生成，不手工录入。
3. 已发布 API（14 个）可被安全运行服务路由命中；draft API（4 个档案占位）不可访问。
4. 下线（unpublish）后 API 立即不可用，恢复发布后可用。

## 3. 前置条件

- 已完成 TC01、TC04。
- 已登录 `nocobase`。

## 4. 操作步骤

### 步骤 1：核对 API 清单与发布状态

```bash
docker exec nocobase-8196-postgres-1 psql -U nocobase -d nocobase -c \
  "SELECT api_code, api_status, publish_status, protection_level, gateway_path \
   FROM security_api_resources ORDER BY id"
```

预期：20 条 API；14 条 `enabled/success`（3 基线 + 10 客户默认查询 + 1 历史资源），4 条档案占位 draft（`API-GRID-LVF-PHASE-011`、`API-CUST-HV-DAILY-INFO-012`、`API-CUST-LV-DAILY-INFO-013`、`API-CUST-HV-DAILY-LOAD-014`），2 条路径占位 draft（消息推送/模型服务）。

### 步骤 2：核对量测档案驱动

```bash
docker exec nocobase-8196-postgres-1 psql -U nocobase -d nocobase -c \
  "SELECT api_code, runtime_config_json->>'table' AS table_name, \
          runtime_config_json->>'timeFieldCode' AS time_field, \
          runtime_config_json->'fieldMap'->>'VOLTAGE' AS value_column, \
          runtime_config_json->'scales'->>'VOLTAGE' AS scale \
   FROM security_api_resources WHERE api_code='API-GRID-LVF-VOLT-001'"
```

预期：`table=measurement_demo.grid_low_freq_voltage`、`timeFieldCode=DATA_TIME`、`value_column=voltage`、`scale=0.001`，字段映射与缩放配置由资源定义自动生成。

### 步骤 3：验证已发布 API 可路由

```bash
cd /Users/fish/Documents/FishStudio/AI/2026/012-电网安全-v2.0
SECRET=$(grep '^SUBJECT_DEMO_SECRET=' docker/.env | cut -d= -f2)
SUBJECT_SECRET="$SECRET" API_AUTH_MODE=hmac node scripts/call-v3-data-api.mjs \
  "http://127.0.0.1:8090/data-api/resources/grid-lvf-volt-001?pageSize=3" \
  APP-ONLINE-GRID online-grid-lvf-voltage
```

预期：HTTP 200，返回脱敏数据（`PSR***`），`X-Decision: allow`。

### 步骤 4：验证 draft 占位 API 不可路由

```bash
SUBJECT_SECRET="$SECRET" API_AUTH_MODE=hmac node scripts/call-v3-data-api.mjs \
  "http://127.0.0.1:8090/data-api/resources/cust-hv-daily-info-012?pageSize=3" \
  APP-MARKETING-2 marketing-2-hv-daily-info
```

预期：HTTP 404 `ROUTE_NOT_FOUND`（API 未发布，路由不命中）。

### 步骤 5：验证上下线

1. 获取管理 token 与 API id：

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8196/api/auth:signIn \
  -H 'Content-Type: application/json' \
  -d '{"account":"nocobase","password":"admin123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
# API-GRID-LVF-VOLT-001 的 id 为 6（按 TC01 基线核对命令确认）
```

2. 下线 `API-GRID-LVF-VOLT-001`：

```bash
curl -s -X POST http://127.0.0.1:8090/management/apis/6/unpublish \
  -H "Authorization: Bearer $TOKEN"
```

3. 重复步骤 3，预期 HTTP 404 `ROUTE_NOT_FOUND`。
4. 重新发布：

```bash
curl -s -X POST http://127.0.0.1:8090/management/apis/6/publish \
  -H "Authorization: Bearer $TOKEN"
```

5. 重复步骤 3，预期恢复 200。

## 5. 通过标准

- 资源 ↔ API 一对一，编码/路径自动生成。
- 量测档案与资源定义一致，无重复录入。
- 已发布可路由、draft 不可路由。
- 下线立即不可用、恢复发布后可用。

## 6. 证据要求

- API 清单 SQL 输出
- 量测档案 SQL 输出
- 发布/未发布调用响应（含 requestId）
- 上下线操作前后调用对比
