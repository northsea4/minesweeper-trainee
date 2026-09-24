# 性能基线

测量主机：开发机（Apple Silicon，Node 24 / Chromium headless）。代表设备的真实性能门禁为人工发布验收项。

## 自动化门禁

| 指标 | 预算 | 自动化 |
| --- | --- | --- |
| 默认预设首局生成 p95 / p99 | ≤ 300ms / ≤ 800ms | `tests/perf/perf.test.ts` |
| 极端预设生成 p95（超预算显式失败） | ≤ 2s（+1 个在途校验步） | `tests/perf/perf.test.ts` |
| 揭格 reducer p95 | < 16ms（60fps 一帧） | `tests/perf/perf.test.ts` |
| 存档序列化 p95 | < 50ms | `tests/perf/perf.test.ts` |
| 输入 → 视觉反馈 p95 | ≤ 100ms | `tests/e2e/perf.spec.ts` |
| 暂停 / 恢复 | ≤ 100ms | `tests/e2e/perf.spec.ts` |

运行：`pnpm test`（含内核与 perf）、`pnpm e2e`（含交互延迟）。CI 建议单独跑 `vitest run tests/perf` 作为回归。

## 实测：9×9 各雷数生成（8 个 seed，预算 2s）

| 雷数 | 成功率 | p95 |
| --- | --- | --- |
| 5 | 8/8 | 3ms |
| 10（初级） | 8/8 | 4ms |
| 15 | 8/8 | 9ms |
| 20 | 8/8 | 32ms |
| 25 | 8/8 | 52ms |
| 30 | 8/8 | 399ms |
| 35 | 6/8 | 2003ms |
| ≥ 40 | 0/8 | 预算耗尽 |

**密度上限**：9×9 可靠生成到 30 雷（≈37%）。据此产品密度上限设为 **38%**（`MAX_DENSITY`），`validatePreset` / 自定义预设校验据此拒绝更高密度并提示可重试的显式失败。

## 架构

- 生成与校验跑在 Dedicated Worker（`src/worker/solver.worker.ts`），typed arrays + transferable；主线程只持有可渲染公开状态。
- 生成有界：`maxCandidates` / `maxRepairsPerCandidate` / `deadlineMs` / `maxSteps`，预算耗尽返回 `budget-exhausted`，绝不静默降级。
- 主线程无第三方分析 SDK，无外部网络请求（见 `tests/e2e/pwa.spec.ts`）。
