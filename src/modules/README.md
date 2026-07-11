# Frontend Modules

- `DataCatalog`: 门户壳模块，承载登录、首页、预览页、个人中心、模块访问守卫，并聚合业务模块路由。
- `SecurityGovernance`: 数据安全管控模块，承载安全态势、数据接入、访问控制、审计追溯、标签配置、安全资源列表和安全详情路由。

顶部导航和产品方案当前只注册 `SecurityGovernance`。旧的资源管控、数据产品、应用管控、共享管控、运行监督和驾驶舱模块壳已下线，不再保留在 `src/modules`。

## 统一模块结构

业务模块遵循以下结构：

```text
src/modules/<ModuleName>/
  index.ts      # 模块入口，导出 { manifest, Routes }
  manifest.ts   # 模块元信息：id、标题、入口路径、路由前缀、导航目标、首页区块
  routes.tsx    # 模块路由
  pages/        # 模块专属页面，当前存量页面逐步迁入
  components/   # 模块专属组件
  lib/          # 模块专属数据与工具逻辑
```

跨模块共性放在：

- `src/modules/types.ts`: 模块契约类型。
- `src/modules/registry.ts`: 模块注册表和统一模块清单。
- `src/lib`: 跨模块数据客户端、认证、配置、缓存、产品方案等公共逻辑。
- `src/components`: 跨模块通用 UI 组件。

任务脚本已从前端源码目录拆出到仓库根目录 `TaskScripts/dolphinscheduler`。
