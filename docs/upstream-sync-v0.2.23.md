# 同步官方 v0.2.23

同步日期：2026-11-19。官方来源为 `v0.2.23`（`5af9afb58`），包含随后将版本号改为 0.2.23 的提交 `2af3f1e15`；本地原版本为 `0111e776e`。

## 合并结果

- 接入官方 GPT-6.2 模型、Ultra Fast 渠道倍率、缓存用量与计费修复、流式超时处理及性能改进。
- 唯一文本冲突位于 `openai_gateway_response_handling.go`：保留官方 OpenAI 首次输出前的空闲超时切换及单次切换预算，同时保留本项目 Grok 有限重试、不因该超时写入账号级临时禁用的行为。
- 原有监控、降智检测、账号开关和支付定制继续保留。
- 更新 Ultra Fast 的多语言测试，检查新的 GPT-6.2 套餐说明，不再要求文案含旧的协议字段表达。

## 数据库

新增官方迁移 `252_channel_pricing_ultrafast_multiplier.sql`，为既有 `channel_model_pricing` 表增加可空的 `ultrafast_multiplier` 字段和正数约束，不新增表。未配置时沿用模型默认倍率。

它与本项目 `252_channel_monitor_intelligence.sql` 文件名不同，迁移记录按完整文件名保存，两者不覆盖；原有 252–255 定制迁移不改名、不改内容。

## 验证

- 前端全量执行 3,222 项，首轮 3,221 项通过；唯一失败是旧文案断言，修正后该测试文件及多语言键完整性共 7 项复测通过。
- Vue TypeScript 检查、变更文件 ESLint 和 Vite 生产构建通过。
- Go 单元测试覆盖协议转换、模型元数据、service、repository、handler、routes、payment、migrations、server。首轮 repository 的三项失败来自 Windows 缺少 `sh`，加入 Git 自带 shell 后整包通过；service 的一项首 Token 计时断言出现 499ms/500ms 边界抖动，单独连续执行三次通过。其余测试在整轮运行通过。
- PGlite 验证了旧服务器监控结构升级、历史数据与开关保留、两个 252 迁移共存、重复执行、默认倍率及正数约束。该验证不替代 PostgreSQL 18 的完整生产数据恢复试验。
- 包含前端资源的 Windows/amd64 和 Linux/amd64 程序构建通过。

临时日志、验证脚本、缓存和程序均在本地项目的 `.cache/`，不会提交。正式服务器未在本次同步中操作；实际模型调用和支付需部署后验收。

## 更新服务器

代码路径为 `/root/xingxing-sub2api`，当前实际部署配置仍位于 `/root/hakimi-sub2api/deploy`，Compose 项目名为 `deploy`，应用镜像为 `xingxing-sub2api:local`。

先拉取本仓库 `main` 并构建镜像，保留旧运行镜像标签。涉及数据库变更，建议先将正式库备份恢复到独立测试库验证升级。正式切换前停止应用写入并重新备份数据库和 `/app/data`，然后仅重建 `sub2api` 应用服务，沿用原 PostgreSQL、Redis、配置和数据卷。不要使用 `docker compose down -v`。

不要从新源码目录直接使用默认 Compose 启动：默认文件使用官方镜像，并且不能代替现有正式部署配置。
