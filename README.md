# Minesweeper Trainee

本地优先、无需账号、可离线运行的响应式扫雷 PWA。以高性能经典扫雷为核心，**所有棋盘默认无猜**：从首击起，依据版本化的求解策略始终存在仅凭已知信息推进并完成对局的路径。

它把两种体验明确分开：

- **训练对局**：可使用提示 / 智能提示 / 领航，触雷自动复活、闲置轻推；成绩不计排名。
- **计时挑战**：无任何辅助，暂停只遮罩不停表、中断期间真实时间计入；胜利产生有效成绩。

领域词汇见 [`CONTEXT.md`](./CONTEXT.md)，产品与技术规格见 GitHub Issue #16。

## 环境要求

- Node.js ≥ 20（开发使用 24）
- pnpm ≥ 9（开发使用 10）
- 浏览器：桌面 Chrome / Edge、Android Chrome、iOS / iPadOS Safari（Tier 1）

## 快速开始

```bash
pnpm install
pnpm start          # 开发服务器，默认 http://localhost:5173
```

构建与预览：

```bash
pnpm build          # 生产构建（TypeScript 检查 + Vite + PWA manifest/SW）
pnpm preview        # 预览构建产物
```

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm start` / `pnpm dev` | 启动开发服务器 |
| `pnpm test` | Vitest：求解内核、规则、生命周期、辅助、存档、记录、性能单测 |
| `pnpm bench` | 仅跑性能基准（`tests/perf`） |
| `pnpm e2e` | Playwright 端到端（自动 build + preview，使用 4173 端口） |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm build` | 生产构建 |
| `pnpm preview` | 预览构建产物 |

首次跑 e2e 需要浏览器：

```bash
pnpm exec playwright install chromium
```

## 调试用 URL 参数

固定棋盘便于复现与测试：

```
http://localhost:5173/?w=9&h=9&m=10&seed=7&mode=training
```

- `w` / `h` / `m`：宽 / 高 / 雷数
- `seed`：随机种子
- `mode`：`training` 或 `challenge`

页面还暴露 `window.__ms`（`getState()` / `dispatch(action)` / `snapshot()`）用于 e2e 与调试。

## 项目结构

```
src/
  core/          纯内核：规则、生成、求解、分析、辅助、训练、记录、存档、导入导出
    types.ts        领域类型（BoardKey、GameState…）
    rng.ts          版本化 PRNG
    board.ts        棋盘类型与邻域
    generator.ts    无猜生成（随机候选 + 修复 + 拒绝回退，有预算）
    analyze.ts      analyze(publicState, policy) → DeductionProof
    certificate.ts  可重放 certificate 的认证与重放
    aid.ts          提示 / 智能提示 / 领航共用的下一步
    rules.ts        规则 reducer 与生命周期状态机
    training.ts     自主水平、求助阶梯、先试一次门、轻推
    records.ts      对局记录、挑战资格、本地排行
    save.ts         存档序列化
    transfer.ts     导入导出与 schema 迁移
    customPresets.ts 自定义预设校验与去重
  worker/        Dedicated Worker：生成与求解
  ui/            命令式棋盘渲染与辅助文案
  app/           Preact chrome：状态仓库、设置、感官、持久化、历史
  styles.css
tests/
  core/ tests/app/   内核缝单测（Vitest）
  perf/              性能基准
  e2e/               Playwright（交互、生命周期、无猜、辅助、存档、离线、a11y、性能）
  support/oracle.ts  独立精确 CSP oracle
```

## 架构要点

- **TypeScript + Vite + pnpm**；chrome 用 Preact，棋盘为命令式 DOM 渲染，状态是纯 reducer / 状态机。
- **求解内核**：纯 TS 窄求解器，跑在 Dedicated Worker + typed arrays（transferable）；精确 CSP 仅作测试 oracle。
- **无猜**：`BoardKey = (algorithmVersion, policyVersion, prngVersion, seed, width, height, mines, firstIndex)`；预算耗尽显式失败并可重试，绝不静默降级。
- **持久化**：IndexedDB（异步、非阻塞），带 `schemaVersion` 迁移；localStorage 回退。
- **离线 PWA**：Service Worker + Manifest，应用外壳预缓存；无遥测、无外部网络请求。

## 文档

- [`CONTEXT.md`](./CONTEXT.md) — 领域词汇表
- [`docs/perf/baseline.md`](./docs/perf/baseline.md) — 性能预算与实测基线
- [`docs/release/acceptance.md`](./docs/release/acceptance.md) — 发布验收清单（自动化 + 人工门禁）
- [`docs/adr/`](./docs/adr) — 架构决策记录
- [`docs/agents/`](./docs/agents) — issue tracker、triage 标签、领域文档约定

## License

尚未选定；保持适合后续开源的宽松许可方向。
