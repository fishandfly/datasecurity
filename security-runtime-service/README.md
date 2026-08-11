# 量测数据安全运行服务

轻量运行服务统一承担数据源连接检查、数据 API 路由、签名认证、动态策略、安全动作执行、量测查询编排和审计回写。

## 前台配置映射

- 数据源：配置数据库或已有接口的地址、账号和凭据引用，连接检查与实际取数共用该配置。
- API 资源：配置接入模式、关联数据源、发布路径、上游地址或受控处理路径。
- 访问主体：配置主体编码、有效期、IP 范围、API Key 安全引用和允许访问的 API 编码清单。
- 访问策略：鉴权和 API 授权通过后，配置资源级场景、时间、区域、组织、行数、输出模式、风险阈值和异常访问处置；字段范围由 API 发布配置负责。
- 策略发布：校验配置并生成可立即生效的发布版本。
- 运行状态：汇总配置读取、数据接入、策略控制和密态计算链路状态。

前台只配置业务对象，不提供 Python、网关或通用脚本编辑页面。

## 运行接口

- `GET /health`
- `GET|POST /data-api/{path}`
- `POST /management/data-sources/{id}/test`
- `POST /management/apis/{id}/publish`
- `POST /management/policies/{id}/publish`

数据 API 默认使用 `X-API-Key` 和 `X-Scenario`。API Key 只通过 `SUBJECT_SECRETS_JSON` 注入，数据库只保存安全引用。运行顺序固定为：API Key 鉴权 → 主体 API 授权清单 → 资源访问策略 → 安全动作 → 审计日志 → 数据访问。

兼容增强签名模式：使用 `X-Access-Key`、`X-Timestamp`、`X-Nonce`、`X-Signature` 和 `X-Scenario`。签名原文为：

```text
METHOD\nPATH\nSORTED_QUERY\nSHA256(BODY)\nTIMESTAMP\nNONCE
```

主体和数据源凭据只通过 `SUBJECT_SECRETS_JSON`、`SOURCE_SECRETS_JSON` 注入，数据库仅保存凭据引用。
