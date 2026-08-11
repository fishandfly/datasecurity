# CT13 API 运行时统一管控日志

## 目标

验证每次主体调用数据 API 都生成一条以 `request_id` 贯穿的统一运行时日志，完整记录“标签补全 -> 分类分级 -> 动态策略 -> 安全动作执行 -> 审计记录”五个阶段，并能区分放行和拒绝。

## 步骤

1. 依次调用 CT06 中的脱敏、聚合、BFV、CKKS 和跨域 BFV 代表 API，密态请求必须串行提交。
2. 从每次响应读取 `requestId`，查询：

```sql
SELECT request_id, decision_result, decision_reason_code, risk_score,
       applied_limits_json->'runtimeTrace' AS runtime_trace
FROM security_policy_decision_logs
WHERE request_id='<请求编号>';
```

3. 对一条正常放行日志和一条高风险拒绝日志，检查 `runtimeTrace` 的阶段顺序：

```text
label_enrichment / classification / dynamic_policy / security_action / audit_record
```

4. 查看 `security-runtime` 容器日志，按 `requestId` 搜索 `security_api_access` 结构化日志。日志只允许包含 API、主体、策略、风险和五阶段证据，不得包含密码、Secret、Token、签名或原始数据值。
5. 在数据资源详情页的“访问策略最近执行日志”或日志中心打开对应记录，确认前端可直接看到五个阶段、逐条策略结果和访问链路。

## 预期

- 每个 API 请求只有一条唯一决策日志，允许和拒绝均有 `runtimeTrace`。
- 标签补全阶段包含 `matchedLabels`、字段标签和快照版本。
- 分类分级阶段包含防护层、敏感度和分类属性。
- 动态策略阶段包含策略 ID、编码、版本、输出模式和原因编码。
- 策略评估包含每个候选策略的编码、版本、结果（通过/未命中/不通过）和原因；同时保留运行规则逐条结果。
- 安全动作阶段包含 `ALLOW`、`MASK`、`ROUTE_TO_ISOLATION`、`ROUTE_TO_HE_COMPUTE` 或 `DENY` 等实际结果。
- 访问链路包含数据源、数据资源、数据应用、API、访问模式、编排路径和输出模式。
- 审计记录阶段始终为 `audit_recorded`；允许和拒绝请求均只保留同一条完整版决策日志，不创建风险事件。
- OpenFHE 请求串行执行，避免单任务互斥导致的并发 `429`；若服务短时繁忙，失败请求仍必须留下完整拒绝轨迹。
