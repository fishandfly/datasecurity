# CT02 数据源配置与 Secret 引用

## 目标

验证数据源可连接，凭据只保存 Secret 引用。

## 步骤

1. 在数据源页面确认仅有 `SRC-YC20-001`。
2. 查询并检查配置：

```sql
SELECT source_code,connection_status,secret_ref,
       security_config_json::text ~* 'password' AS has_password
FROM security_data_sources WHERE source_code='SRC-YC20-001';
```

3. 在页面点击“测试连接”，查询最新 `security_ingest_logs`。

## 预期

状态为 `connected`，`secret_ref` 以 `secret://` 开头，`has_password=false`，连接检查日志成功。页面不显示密码明文。
