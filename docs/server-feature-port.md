# 服务器功能迁移记录

本地目录：`D:\sub2api-new\xingxing-sub2api`；日常维护分支：`main`。初始迁移保留在 `port-server-features` 分支。后续官方同步见 [v0.2.23 记录](upstream-sync-v0.2.23.md)和 [v0.2.24 记录](upstream-sync-v0.2.24.md)。

自己的仓库为 https://github.com/xingxing-cyber/sub2api ，保留官方仓库 https://github.com/Wei-Shaw/sub2api 的历史与 upstream remote。本次在官方 v0.2.22（`15871f9`）上迁移服务器定制功能，没有把旧 fork 整体覆盖到新仓库。

## 来源与核对方式

服务器二进制报告版本 `0.2.17 / 6ce9ac008-codeerx-custom`，源码来自用户提供的 `server-snapshot`。先将 `6ce9ac008` 与官方 `v0.2.17` 比较，识别 fork 定制，再叠加服务器快照中未提交的修改，与当前官方基线逐项合并。没有迁移 macOS `._*` 元数据、旧构建产物、机器部署配置及无关的换行差异。

源码快照与运行中二进制之间没有可复现构建证明，因此这里的“迁移”指已核对快照中的代码功能；还没有连接生产服务器逐项验收。

## 迁移的功能

- 渠道状态 V3 卡片：按平台/分组展示、用户倍率、最新监控桶、悬浮时间线、四档时间范围及定时刷新。监控模式为 V2 时默认展示 V3，`?monitor_view=v2` 可查看原矩阵；V1 模式保留。
- 被动监控采用服务器的长文本流式请求筛选，排除短提示、同步请求和图片流量；保留流式失败统计及按请求去重。增加排除冷启动的缓存率；原缓存率及健康评分口径保留。
- 时间线按服务器规则展示：错误率达到 15% 或首 Token 超过 20 秒为黄色；错误率达到 30% 或首 Token 超过 60 秒为红色。样本不足为灰色，脱敏的请求数量不影响判断。
- 独立降智检测、重试和账号切换；分组检测结果附加到矩阵接口。账号检测每 10 分钟运行，模型为 `gpt-6-astra` 和 `gpt-6.1-sol`。分组的账号检测开关只对 OpenAI 生效，默认关闭。
- 管理员账号页展示每个模型的降智历史，以及缓存率、首 Token 和错误率等实时数据。
- 账号编辑增加“永不临时禁用”开关；相关调度、限流、令牌刷新及 Grok 瞬时故障处理沿用服务器定制逻辑。
- V1 主动监控的请求/重试与连续失败判定，以及定制的网关兼容处理。
- 管理员用量表的缓存命中率展示及相关扣费回归修复。
- 易支付的可配置 MD5/RSA 查询、GET/POST 查询兼容、USDT/二维码流程、签名返回后的支付恢复与订单轮询。

支付合并时保留官方的商户绑定、字段校验和可配置退款成功码。不支持查单接口的 bePusdt `404 page not found` 仍可处理已验签通知；网络异常、错误订单号、错误金额及显式查单失败不会被统一当成查询成功。这是对旧 fork 过宽错误处理的修正。

## 数据库变化

本次相对官方基线新增 **2 张表**：

| 表名 | 用途 |
| --- | --- |
| `channel_monitor_intelligence_history` | 分组检测历史 |
| `channel_monitor_account_intelligence_history` | 账号、模型、时间维度的检测历史 |

同时增加 `groups.account_intelligence_enabled`；在 `channel_monitor_v2_metrics_1m` 和 `channel_monitor_v2_metrics_rollup` 分别增加 `cache_sample_read_tokens`、`cache_sample_prompt_tokens`。

迁移文件为 252–255，使用新的文件名，未改写官方历史 SQL。旧服务器已经存在的同名表通过 `IF NOT EXISTS` 兼容；已有模型历史、分组开关和缓存统计值保留。旧的账号/分组历史转换为账号/模型历史时会合并重复记录。旧 fork 的 `models_list_config` 修复不重复移植：官方已经采用 `model_allowlist` 并包含对应修复。

## 验证范围

2026-11-18 本地验证结果：320 项前端测试全部通过；TypeScript、变更文件 ESLint、Vite 构建通过；下列后端包最终一轮回归全部通过；Windows 与 Linux/amd64 均构建成功。Linux 文件已核验为 64 位 x86-64 ELF，Windows 程序可执行 `--version` 并报告 `0.2.22 / 15871f9-server-port-local`。

- Go 1.27.4；已重新生成 Ent 和 Wire，检查退出清理与服务注入。
- 前端功能测试包含监控卡片/时间线/检测记录、分组开关、账号编辑、支付与多语言键检查；同时运行 TypeScript 检查、变更文件 ESLint 检查和 Vite 生产构建。
- 后端验证涵盖 service、repository、handler、payment、routes、migration 与 server 包。
- 使用 PGlite（PostgreSQL WASM 引擎）分别验证空功能表结构和服务器历史表结构，检查重复执行、默认关闭、账号筛选、模型主键及原有数据保留。该检查没有替代 PostgreSQL 18 上的完整迁移链或生产数据恢复试验。
- 构建含前端资源的 Windows 和 Linux/amd64 程序；本地产物位于仓库外，避免误提交。

关键日志：`frontend-full-final-tests.log`（320 项）、`frontend-final-typecheck.log`、`frontend-final-lint.log`、`frontend-last-build.log`、`backend-verified-tests.log`（最终后端回归）、`backend-linux-build.log`。构建产物为 `sub2api-validation.exe` 与 `sub2api-linux-amd64`，均在 `D:\sub2api-new`。

本地验证日志在 `D:\sub2api-new`，SQL 验证脚本在 `D:\sub2api-new\migration-validation\validate.mjs`。本次迁移代码保存在 `port-server-features` 分支，服务器容器和数据库没有变动。

仓库原有 `deploy/docker-compose.yml` 默认拉取官方镜像。另附 `deploy/docker-compose.custom.yml` 构建本 fork 的 `xingxing-sub2api:local`，供测试及后续切换时合并使用；它沿用主 Compose 的数据库和卷，不能把它当作自动隔离的测试环境。

## 切换生产前的下一步

1. 在服务器备份 PostgreSQL、部署配置和当前镜像，保留可恢复的原版本。
2. 用数据库备份恢复到独立测试数据库，用新程序试运行；不要让新旧程序共用生产数据库进行试跑，因为启动时会执行迁移。
3. 测试实例先设置 `CHANNEL_MONITOR_INTELLIGENCE_DISABLED=1`。核对登录、账号、分组、余额、监控历史和支付订单后，再明确启用检测并验证真实模型调用。
4. 对照服务器原实例验收功能后，再安排构建部署镜像和切换容器。新代码部署成功前，生产继续使用现有容器。

生产数据尚未导入本地，真实模型探测、真实支付和 Docker 容器运行没有在本轮验证。
