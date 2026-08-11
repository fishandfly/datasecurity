# CT04 API 发布与运行时配置

## 目标

验证 API 发布状态、执行路径和量测字段映射可支撑后续安全动作。

## 步骤

1. 查询 `security_api_resources`：

```sql
SELECT api_code,access_mode,orchestrator_path,gateway_path,api_status,publish_status,
       runtime_config_json::text
FROM security_api_resources ORDER BY id;
```

2. 确认 6 条 API 为 `enabled/success`；L1 `API-DIRECT-REGION-LOAD` 的执行路径为 `/internal/region-hourly`。
3. 检查低频电压、日冻结、客户曲线 API 的 `fieldMap`、默认字段、时间字段、值字段和脱敏字段。
4. 临时下线低频电压 API，调用一次后立即恢复原状态。

## 预期

正常路由可被加载；下线返回 `404 ROUTE_NOT_FOUND`，恢复后成功。L1 API 不能配置为未执行安全动作的直连转发；量测档案字段映射完整。
