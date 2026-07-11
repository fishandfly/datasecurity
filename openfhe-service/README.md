# OpenFHE 适配服务

本服务只实现项目最小边界内的 OpenFHE `BFV`、`CKKS`，支持 `sum` 和 `mean` 两种聚合。

## 启动与验证

```bash
docker compose -f docker/docker-compose.yml up -d --build openfhe
curl http://127.0.0.1:8088/health
docker compose -f docker/docker-compose.yml run --rm openfhe pytest -q
```

服务接口：

- `GET /health`
- `POST /v1/tasks/execute`

执行请求示例：

```json
{
  "taskCode": "HE-BFV-DEMO-001",
  "scheme": "BFV",
  "operation": "sum",
  "values": [128, 256, 384, 512]
}
```

## 约束

- 输入数组为 1 到 64 个数值。
- BFV 只接受整数，单值绝对值不超过 10000，聚合值绝对值不超过 30000。
- BFV 均值要求整数输入可整除。
- CKKS 单值绝对值不超过 1000000，响应包含近似误差和校验结果。
- 响应和服务日志不包含输入明文，只保存结果摘要、请求编号、版本和耗时。
- Compose 仅将服务绑定到 `127.0.0.1:8088`。生产环境的 TLS、mTLS 或令牌校验应由受控网关终止，不属于本适配服务的最小实现边界。
