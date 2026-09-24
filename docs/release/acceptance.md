# V1 发布验收清单

对应规格 #16 与票据 #28。**发布阻塞（必须）** 项逐条给出证据。

## 自动化门禁（CI 可跑，本仓库已绿）

| # | 门槛 | 证据 |
| --- | --- | --- |
| ① | Tier 1 端到端全过（Chromium 代表） | `pnpm e2e`：交互、生命周期、无猜、辅助、记录、存档、离线、无障碍、性能、发布冒烟（`tests/e2e/*`） |
| ② | 性能预算（自动化部分） | `pnpm bench` + `tests/e2e/perf.spec.ts`，见 `docs/perf/baseline.md` |
| ③ | WCAG 2.2 AA 自动化扫描 | `tests/e2e/a11y.spec.ts`（axe-core 无 serious/critical） |
| ⑤ | golden 向量 + 独立 oracle + 无静默降级 | `tests/core/generate.test.ts`、`tests/core/analyze.test.ts`（精确 CSP oracle）、`budget-exhausted` 断言 |
| — | 无未决严重缺陷 | 全量 `pnpm typecheck` / `pnpm test` / `pnpm e2e` 通过 |

## 人工发布门禁（需在真实环境执行，非自动化）

| # | 门槛 | 状态 |
| --- | --- | --- |
| ② | 3 层代表设备（入门 Android、老款 iPhone、集显笔记本）真实性能 | 待人工 |
| ③ | 实机辅助技术：iOS VoiceOver / Android TalkBack / Windows NVDA（Tier 1） | 待人工；棋盘不承诺 SR 完整游玩（ADR-0001） |
| ④ | 低龄可用性研究：桌面鼠标与手机触屏各 ≥5 名 6–8 岁儿童、≥4/5 无人指导完成初级训练对局；定性复核「熟练玩家不被轻推打扰」 | 待人工 |
| ① | macOS Safari / 桌面 Firefox（Tier 2）尽力冒烟 | 待人工 |

## 架构与合规

- 生成 / 求解在 Dedicated Worker；纯 TS 窄求解器，精确 CSP 仅作测试 oracle。
- 本地优先：IndexedDB 持久化，无账号、无遥测、安装后无外部网络请求（`tests/e2e/pwa.spec.ts`）。
- 无猜绑定 `BoardKey`（algorithmVersion / policyVersion / prngVersion / seed / 尺寸 / 雷数 / firstIndex），预算耗尽显式失败，绝不静默降级。
- 训练 / 计时挑战分离：训练不计排名，挑战成绩有效且暂停不停表。
