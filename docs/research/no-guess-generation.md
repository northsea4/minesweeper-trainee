# 无猜生成与逻辑求解方案

研究票据：[调研无猜生成与逻辑求解方案](https://github.com/northsea4/minesweeper-trainee/issues/8)
研究日期：2026-08-11

## 结论摘要

本研究建议 V1 采用以下路线：

1. **首击后生成**：把首次揭格坐标纳入棋盘身份，排除该格及其邻格后再布雷，使首次揭格为 `0`，并从这里开始验证。
2. **有界的“随机候选 + 求解验证 + 局部修复/重试”**：以 Simon Tatham 的 solver-guided perturbation 为主要参考；每次候选和整次请求都必须有预算、可取消，失败时显式返回失败，绝不能静默降级成可能需要猜的棋盘。
3. **同一纯分析内核服务四处**：生成验证、提示、智能提示、领航都调用同一 `analyze(publicState, policy)`；验证器只通过公开信息推理，不得偷看雷区决定下一步。
4. **证明驱动的求解器**：先做单格规则、集合差/子集规则和全局剩余雷数；每个确定动作附结构化证明。精确 CSP/模型枚举适合作为高级技巧和测试 oracle，但不应在没有可解释策略时让棋盘仅靠它通过认证。
5. **Dedicated Worker 执行**：生成和复杂求解不占用 UI 事件循环；棋盘用扁平 typed arrays 表示，跨线程用 transferable `ArrayBuffer` 传递。
6. **固定且版本化的 PRNG**：不能用 `Math.random()` 复现棋盘。保存 `(algorithmVersion, policyVersion, seed, width, height, mines, firstIndex)`；长期导入导出还应保存实际雷区或完整棋盘描述。
7. **自定义预设必须有产品上限**：若承诺任意首击为 `0`，至少要求 `width,height >= 3` 且 `1 <= mines <= width*height-9`。最大面积、边长和生成预算不能照搬其他产品，必须在目标桌面与移动设备上用 p50/p95/p99、取消延迟和峰值内存确定。

这里的“无猜”不是脱离算法的绝对标签，而是：**给定首击和一套明确、版本化的求解策略，验证器能仅使用当时可见信息，连续证明安全格或雷格，直至胜利**。

## 研究边界与证据等级

下文使用三个标签：

- **事实**：直接来自论文、规范、项目官方文档或项目源码。
- **推断**：由这些事实和算法性质推出，尚未在本项目实测。
- **建议**：面向 Minesweeper Trainee V1 的设计选择，不冒充外部事实。

本研究没有找到一份高可信一手资料，能证明存在一个对任意尺寸、雷数、首击都兼具有限最坏耗时、自然随机分布和人类可解释性的通用无猜生成器。因此不能把“所有合法自定义预设都能迅速生成”写成无条件规格。

## 一手证据

### Simon Tatham's Portable Puzzle Collection

**事实**：官方 Mines 文档称默认生成能从初始开放区完整推导，不需要猜；同时警告非常高的雷密度可能让程序一直寻找可解棋盘。[S1]

**事实**：官方源码 `mines.c`（提交 `3c3632259d298ab62aafa8a5858823569ab1af46`）实现了以下流程：[S2]

- `open_square` 在第一次揭格时才调用 `new_mine_layout`，所以布局依赖首击坐标。
- `minegen` 从候选位置中排除与首击横纵距离都不超过 1 的格，即保留一个裁剪到边界内的安全邻域；随后断言首击值为 `0`。
- `minesolve` 把每个已揭数字变成“未知格集合 + 剩余雷数”，先做全空/全雷、集合重叠与子集差，再在局部推理停滞时使用全局剩余雷数。
- 全局集合组合会出现 `2^n` 枚举，源码主动把 `n` 截到 10。
- 求解停滞时，`mineperturb` 在保持总雷数的前提下搬移雷；若修复没有持续降低所需 perturb 次数，则丢弃候选并重来。
- 允许整片未知区的大 perturb 有助于极高密度，但源码说明这会把雷堆到远角、降低棋盘质量，因此前 100 次候选禁用。
- 外层是没有固定次数上限的 `do ... while (!success)`。

**事实**：同一源码拒绝无猜模式下宽或高小于等于 2 的棋盘，并说明 `2×n` 经常不存在可唯一推导的布局；它还限制 `mines <= width*height-9`。[S2]

**事实**：项目的 PRNG 是跨平台固定实现；项目文档明确说 seed 在相同程序版本可重建棋盘，但生成算法变化后不保证相同，若要跨版本稳定应保存描述性 game ID。[S2][S3]

### JSMinesweeper

**事实**：JSMinesweeper 是一个在浏览器本地运行的 JavaScript 玩家、求解器与分析器。其 README 明确说 No Guess 棋盘在首次点击后生成，而且换首击位置时同一棋盘可能不再无猜。[S4]

**事实**：提交 `01eafd3fea4e95c7c692f231c5088fc7a1f0dc00` 的 `createNoGuessGame` 采用纯拒绝策略：生成零开局候选，反复调用 solver；一旦 solver 只能给出概率小于 1 的动作，就换 seed 生成下一盘。代码提供取消标记、最多 1,000,000 次内部循环，并在运行超过 1 秒后周期性 yield 和显示进度；未完成会显示失败。[S5]

**事实**：该项目把确定单格规则、精确概率引擎、50/50 检测、猜测逻辑和 brute-force 分层。作者称概率引擎的代价随相连前沿指数增长，并给出“`50×50/500` 应可运行、`100×100/2500` 可能吃力”的项目经验，而不是通用浏览器保证。[S4]

**事实**：它的深层 brute-force 源码设置了 1 亿节点和 7500 万 cycle 的停止阈值，并会持有全部候选 solutions。这证明成熟实现也必须主动限制组合爆炸，但这些数字不应直接成为本项目预算。[S6]

### 复杂性与 CSP

**事实**：Kaye 证明一般化的 Minesweeper consistency problem 为 NP-complete。[S7]

**事实**：Studholme 的原始项目论文把未知格建模为 0/1 变量，把每个已揭数字建模为邻格变量之和；它先化简单约束和子集约束，再把互相耦合的约束分成组件并回溯枚举，按“该解所含雷数”聚合计数。论文指出回溯的时间大致随变量数指数增长，同时建议不要存下每个完整解，只保存聚合计数。[S8]

**推断**：不存在可以依赖的多项式最坏情况。对某格是否“被迫安全”的完整判定，至少要解决一个或多个一致性查询；实际实现应利用小前沿、约束分量、剪枝和缓存获得良好常见情况，但仍必须保留超时/取消路径。

### 浏览器平台

**事实**：WHATWG 为 worker 定义独立的 worker event loop；Dedicated Worker 通过消息通信。Transferable 对象转移底层数据所有权并 detach 原对象，规范特别指出同进程 realm 间转移 `ArrayBuffer` 时通常无需重新分配原数据内存。[S9][S10]

**事实**：ECMAScript 只要求 `Math.random()` 使用实现定义的算法或策略，不提供应用可控 seed，因此它不能作为跨浏览器、跨版本 golden test 的 PRNG。[S11]

**事实**：Z3 官方提供通过 Emscripten 构建的 TypeScript/Wasm 绑定和浏览器入口；当前 npm `z3-solver@5.0.0` 的 registry 元数据给出约 35.5 MB unpacked size。官方绑定源码仍标有“make Z3 multi-threaded”和长时间 `check()` 中断清理的 TODO。[S12][S13]

**建议**：Z3/SAT/SMT 很适合作为开发期独立 oracle 或离线诊断工具，但其包体积、初始化、解释层和中断语义使它不适合直接成为 V1 默认运行时内核。V1 先实现针对扫雷约束的窄求解器；若后续基准证明需要，再把 Wasm solver 放进可选 worker chunk。

## “逻辑可解”的正确规格

### 公开信息模型

每个未揭格对应布尔变量 `x_i`：有雷为 1，无雷为 0。对每个已揭数字格 `c`：

```text
sum(x_i for i in coveredNeighbors(c))
  = clue(c) - solverConfirmedMinesAround(c)
```

全局还有：

```text
sum(x_i for i in allCoveredCells) = minesRemaining
```

玩家旗帜必须与 `solverConfirmedMine` 分开。运行时提示若直接把玩家旗帜当成事实，错误旗帜会让求解器生成错误提示；它应忽略玩家旗帜，或把它们作为可撤销假设并能报告矛盾。JSMinesweeper 明确采用“旗帜即事实”的行为，这正好暴露了本项目需要避免的产品风险。[S4]

### 三种不同承诺

1. **布局有效**：雷数、数字、边界和首击安全区正确。
2. **逻辑无猜**：按指定 `solverPolicyVersion`，从指定首击开始始终能产出至少一个确定动作，并最终胜利。
3. **解释可用**：每个用于认证的动作都有 UI 能展示的证明类型。

三者不能互相替代。尤其是“真实布局里这格没有雷”不是逻辑证明；验证器即使持有雷区，也只能在一个已证明安全的动作之后查询它的数字。

### 认证过程

**建议**：生成成功必须伴随一份可重放 certificate：

1. 公开首击并展开 `0` 区域。
2. 只把当前已揭数字、求解器已证明的雷和全局雷数交给 analyzer。
3. analyzer 返回一个或多个 `probability = 1` 的动作及其 proof。
4. 验证 proof 的前提都来自当前公开状态；然后才在实际布局上执行动作并得到新数字。
5. 重复，直到所有非雷格已揭开。
6. 若未胜利但 analyzer 无确定动作，则该候选不符合这套 policy；不能把实际安全格塞进 trace 继续走。

Certificate 不必持久化整场所有中间棋盘；保存确定动作与 proof 的紧凑序列即可在测试中重放。发布版可只保存摘要/哈希，但开发与测试构建应能输出完整 trace。

## 求解技巧与解释对象

| 技巧 | 判定 | 最适合的解释 | V1 建议 |
| --- | --- | --- | --- |
| 单格安全 | 数字格剩余雷数为 0 | 高亮数字格与相邻未知格：“雷已经找齐” | 必须 |
| 单格全雷 | 剩余雷数等于相邻未知格数 | 高亮数字格：“剩下这些格都是雷” | 必须 |
| 集合差/子集 | `A ⊆ B`，用两集合雷数之差约束 `B-A` | 同时描边两个邻域，展示 `b-a` | 必须 |
| 重叠集合翼 | 两集合重叠后，一侧差额恰好填满或为 0 | 高亮公共区与两侧差集 | 可与子集合并实现 |
| 全局剩余雷数 | 未知格数等于剩余雷数，或剩余雷数为 0；也可组合独立约束分量 | 棋盘计数器 + 涉及区域 | 必须 |
| 精确 CSP 强制格 | 在所有一致模型中该格恒为 0 或 1 | “假设相反会产生矛盾”，附涉及约束 | 高级策略；没有可接受解释前不用于低龄认证 |

前三类与 Tatham 源码和 Studholme CSP 分解直接对应。[S2][S8]

**建议**：proof 使用稳定数据而不是成句文本，例如：

```ts
type DeductionProof = {
  technique: "direct-safe" | "direct-mine" | "subset" | "overlap" |
             "global-count" | "model-contradiction";
  clueCells: number[];
  inputSets: Array<{ cells: number[]; mines: number }>;
  conclusion: { cells: number[]; kind: "safe" | "mine" };
  policyVersion: number;
};
```

UI 再把 proof 渲染成适合成人或低龄初学者的图形与文案。这样提示、智能提示、领航只是“选哪个 proof、何时展示、如何渲染”的差别，不各自实现一套推理。

## 生成方案比较

### 方案 A：随机候选 + 拒绝

流程是均匀放置候选雷区、完整求解；一旦需要猜就丢弃候选重来。JSMinesweeper 是可运行的一手实例。[S4][S5]

优点：

- 实现、审计和测试最简单，候选生成与验证边界清楚。
- 只要采样本身均匀，接受分布就是原始分布在“通过 policy”集合上的条件分布，不会因修复步骤额外造成人工形状。
- 验证器与生成器可完全分离。

约束：

- 尝试次数服从通过率，最坏情况无界；高密度、狭长或技巧受限时通过率可能很低。
- 每次失败都浪费一次完整/部分求解。
- 首击后才知道要保护的区域，无法在页面加载时完整预生成目标棋盘。

### 方案 B：随机候选 + solver-guided repair

流程是在 solver 停滞的约束区域内搬移雷，同时从其他位置反向搬移以保持总雷数，再从首击重跑验证。Tatham 的 `mineperturb` 是成熟的一手实例。[S2]

优点：

- 能保留并推进一个接近可解的候选，通常比纯拒绝少浪费工作。
- repair 可以直接针对当前阻塞约束，而不是盲目换整盘。
- 同一 solver policy 自然决定“哪里卡住”和“修到什么程度”。

约束：

- 实现复杂，必须维护雷数、首击安全区、已开数字和 solver 增量状态的一致性。
- repair 会改变棋盘分布；大范围 repair 可能产生堆角、低变化的棋盘，Tatham 源码明确记录了这一质量问题。[S2]
- repair 仍不提供有限最坏时间，必须在“每候选 repair 数”和“总候选数/总时间”两层设限。

### 方案 C：精确 SAT/SMT 直接合成

单个固定公开状态很容易写成 0/1 约束；但“从首击开始，每个中间状态都存在 policy 可解释的下一步”还包含一条动态揭示序列。直接把整条序列编码进 SAT/SMT 会显著扩大模型，并且模型给出的可满足布局不自动带有人类技巧证明。

**建议**：不作为 V1 生成主线。把精确模型查询用于：

- 在测试中独立验证某个 proof 的结论确实在所有模型中成立；
- 分析 analyzer 卡住究竟是棋盘真需猜，还是启发式实现漏解；
- 将来评估高级难度的 `model-contradiction` 技巧。

### 推荐组合

**建议**：使用 B 为主、A 为回退，但所有循环有界：

```text
首击 -> 生成随机候选
     -> policy verifier
        -> 完成：返回布局 + certificate
        -> 停滞：尝试有限次局部 repair
        -> repair 无进展：丢弃候选，换 seed
     -> 达到请求预算：返回明确失败原因
```

不要实现“预算耗尽后关闭无猜继续开局”。这会破坏产品的核心承诺，也使计时挑战之间不再可比。

## 首击处理

**建议**：V1 固定使用“首击开放区”语义，而不是仅保证首格无雷：

- 布局在首次揭格动作确认后生成。
- 排除首格及其最多 8 个邻格，保证首格数字为 0。
- 批量展开相连 0 区域和边界数字后再开始 certificate 推理。
- `(seed, firstIndex)` 共同决定布局；重玩或导入时必须保留首击。

这与两个成熟实现的做法一致，并给零基础玩家足够的初始信息。[S1][S2][S4]

若任意格都允许作为首击，预设级的保守有效性条件为：

```text
width >= 3
height >= 3
1 <= mines <= width * height - 9
```

边角首击实际只排除 4 或 6 格，但中心首击要排除 9 格；`area-9` 保证用户点任意位置都有足够布雷空间。未来若产品允许“仅首格安全”或限制首击区域，应作为不同生成策略与排名类别，不能在同一预设里动态偷换。

## 浏览器正确性与响应性

### 线程边界

**建议**：一个 Dedicated Worker 持有生成器、analyzer 与可选精确 oracle；主线程只持有可渲染的公开状态和输入状态。

```text
UI thread                  Solver worker
---------                  -------------
pointer feedback  ----->   generation request
render/progress   <-----   progress summary
public move       ----->   analyze(public state)
hints/proofs      <-----   deductions + proofs
```

worker 不能让算法本身变快，但能防止长求解占住 UI event loop。[S9] 请求与响应都带单调递增的 `requestId`；用户重开、切预设或离开页面时，旧结果即使晚到也必须丢弃。

### 数据布局

**建议**：

- 棋盘按 row-major 一维索引，避免每格对象。
- 雷区、数字、公开状态、solver 标记分别使用 bitset 或 `Uint8Array`；队列和 frontier 用 `Uint32Array`/普通整数数组。
- 大棋盘从 worker 返回时转移 `ArrayBuffer` 所有权，不深拷贝完整对象图。[S10]
- 生成过程中只发送尝试次数、耗时和阶段，不发送每轮完整棋盘。
- proof 只携带相关格索引，不复制整个状态。

例如 `200×200` 有 40,000 格，一个 `Uint8Array` 是 40 KB；四个同尺寸 byte plane 是 160 KB。真正的内存风险通常不是基础棋盘，而是约束对象、BigInt 计数、保存全部一致模型或 brute-force 树。[S6][S8]

### 延迟与预算

**事实**：Tatham 官方文档和无界外循环表明高密度没有固定完成时间；JSMinesweeper 也提供长任务进度、取消、最大循环与显式失败。[S1][S2][S5]

**建议**：生成 API 至少包含：

```ts
type GenerateRequest = {
  width: number;
  height: number;
  mines: number;
  firstIndex: number;
  seed: string;
  algorithmVersion: number;
  policyVersion: number;
  maxCandidates: number;
  maxRepairsPerCandidate: number;
  deadlineMs: number;
};

type GenerateFailure =
  | "invalid-preset"
  | "budget-exhausted"
  | "cancelled"
  | "internal-verification-error";
```

- pointer/touch 按下和目标格高亮应立即发生；首格真正展开可等待 worker 成功返回。
- 选择预设时可以预热 worker 和模块，但不能在不知道首击时假装已完成目标棋盘。
- 超过短等待后才显示非阻塞进度；取消必须有单独指标。
- 不在本研究里拍脑袋规定 `deadlineMs`。应由性能票据在支持矩阵上测 p50/p95/p99、峰值内存、候选/repair 数和取消确认延迟后确定。

## 算法与最坏情况

令：

- `A = width * height`：总格数；
- `C`：当前约束数；
- `F`：一个耦合前沿组件中的未知格数；
- `R`：候选与 repair 所触发的验证总次数。

**推断**：

- 布雷、计算数字、0 区展开和一次完整线性扫描都是 `O(A)` 时间与 `O(A)` 空间。
- 单格规则可做成与发生变化的数字格数量近似线性；朴素比较所有约束对做子集/重叠会到 `O(C^2)`，应按相邻格或组件索引。
- 精确枚举的最坏时间随 `F` 指数增长。按连通组件拆分、按 mine count 聚合、约束传播和 memoization 能大幅改善常见情况，但不会消除最坏情况。[S7][S8]
- 若 DFS 只聚合统计而不保存每个模型，搜索栈和工作状态可保持在 `O(F+C)` 量级；若保存 `S` 个完整模型则可膨胀到 `O(S*F)`。JSMinesweeper 的 brute-force `allSolutions` 展示了后一种风险。[S6]
- 整体生成时间近似所有验证/repair 成本之和，即 `R * solveCost`；因为 `R` 和 `solveCost` 都可能很大，所以必须依靠业务预算终止。

## 大型与极端自定义预设

**事实**：Tatham 排除无猜 `2×n` 并警告高密度；JSMinesweeper UI 虽允许边长 200，项目作者仍称 `100×100/2500` 可能吃力。[S1][S2][S4]

**建议**：不要把“可保存多个自定义预设”解释成无限尺寸。V1 应分三层校验：

1. **数学有效**：整数、安全乘法、`width,height >= 3`、`1 <= mines <= area-9`、首击在范围内。
2. **产品支持**：`area <= maxArea`、单边不超过 `maxDimension`、密度处于经过验证的范围。
3. **运行预算**：合法且受支持仍可能在本次 seed/首击上预算耗尽；返回可重试失败，不更改规则。

产品上限必须通过以下矩阵确定：

- 经典初级、中级、高级；
- 接近允许上限的面积、边长、长宽比和雷密度；
- 桌面 Chromium/Firefox/Safari；
- 目标移动 Safari/Chrome 的低端与常见设备；
- 冷启动、worker 已预热、取消中和连续生成。

记录 p50/p95/p99、最大值、失败率、候选数、repair 数、solver 最大组件 `F` 和峰值内存。超出支持区间的预设应在保存/开始前说明不受支持，而不是让 UI 无限等待。

## 提示、智能提示与领航的复用

**建议**：核心接口只分析公开状态：

```ts
analyze(publicState, policy) -> {
  status: "progress" | "needs-guess" | "won" | "contradiction";
  deductions: Array<{ action: "reveal" | "mark-mine"; index: number; proof: DeductionProof }>;
}
```

- **提示**：从当前 deductions 中选一个最容易解释的 proof。
- **智能提示**：N 秒无操作后调用相同接口，仍只选一个 proof；计时策略属于交互规格。
- **领航**：持续展示当前全部或排序后的 deductions；玩家行动后增量重算。
- **生成验证**：自动执行一个确定 reveal（或内部记录确定 mine）直到胜利，并收集 certificate。

建议的排序是 `direct > subset/overlap > global > model-contradiction`，再按涉及格数和屏幕距离排序。这样低龄提示优先展示最少前提，而生成器也能按 policy 限制允许的技巧。

玩家走了 certificate 之外但仍安全的一步后，不要硬套原 trace；用当前公开状态重新 `analyze`。Certificate 证明初始布局存在一条无猜路径，analyzer 才是任意合法中间状态的运行时能力。

## 确定性与测试约束

### 棋盘身份

**建议**：

```text
BoardKey = (
  algorithmVersion,
  policyVersion,
  seed,
  width,
  height,
  mines,
  firstIndex
)
```

- 使用项目自有、明确规定整数位宽和溢出语义的 seeded PRNG；不要调用 `Math.random()`。[S11]
- 固定随机数消费顺序；重构若改变消费顺序或生成算法，提升 `algorithmVersion`。
- `policyVersion` 变化可能使同一布局从“通过”变成“失败”，也必须参与身份和统计。
- 存档/导出保存实际布局或描述性 ID，seed 只是紧凑重建方式。Tatham 的跨版本说明直接支持这一点。[S3]

### 必须覆盖的测试

1. **Golden vectors**：固定 BoardKey 对应固定雷区哈希、首击展开结果、certificate 哈希和关键性能计数。
2. **跨运行时一致性**：相同向量在支持的 Chrome、Firefox、Safari 及移动浏览器 worker 中一致。
3. **布局性质**：雷数精确；安全邻域无雷；所有数字由邻雷重算一致；索引无越界。
4. **Certificate replay**：从空白公开状态重放，每一步 proof 前提成立，reveal 从不触雷，最终满足经典胜利条件。
5. **独立 oracle**：测试环境用另一种实现（精确 CSP/SAT 或小盘穷举）检查每个结论在所有一致模型中成立，避免生成器与验证器共享同一个 bug。
6. **小盘穷举**：对可控尺寸枚举全部布局和首击，比较 analyzer 与 oracle 的 forced safe/mine 集合。
7. **边界/模糊测试**：`3×3`、`area-9` 雷、极端长宽比、密度边界、超大整数、重复取消、过期 worker 响应、导入损坏数据。
8. **预算确定性**：不要把 wall-clock 截止直接纳入 golden 布局选择；测试用固定 candidate/repair 计数预算。生产可额外使用 wall-clock deadline，但超时只影响成功/失败，不生成另一盘同 BoardKey。
9. **无静默降级**：故意令预算极小，断言只能得到 `budget-exhausted`，绝不能得到未认证棋盘。
10. **性能回归**：固定语料记录 p50/p95/p99、失败率、最大组件、峰值内存和取消延迟；性能阈值按平台分层。

## 给后续规格的约束

研究证据支持把以下内容作为后续决策的硬输入：

- “无猜”必须绑定首击、solver policy 和版本，不是单一布尔字段。
- 首击生成会影响计时起点、重玩、存档和排行，相关规格必须引用同一个 BoardKey。
- 生成成功必须可由公开信息重放证明；失败必须是正常、可见、可重试的结果。
- 生成、提示、智能提示和领航共享 analyzer 与 proof schema。
- UI 性能不能依赖生成算法总能很快；worker、取消、过期响应隔离和进度状态属于正确性要求。
- 自定义预设的最大尺寸/密度仍需基准票据给出数字；本研究只锁定数学下界、最坏情况和测量方法。
- 低龄训练允许哪些高级 proof 类型，仍应由训练体验原型决定；在此之前，不能让仅靠不可解释精确推理的棋盘进入低龄认证池。

## 来源

- **[S1]** Simon Tatham, [Mines 官方文档](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/mines.html)，尤其是默认 ensure solubility 与高密度可能持续搜索的说明。
- **[S2]** Simon Tatham, [Portable Puzzle Collection 官方源码仓库](https://git.tartarus.org/simon/puzzles.git)，提交 `3c3632259d298ab62aafa8a5858823569ab1af46`，`mines.c` 的 `validate_params`、`minesolve`、`mineperturb`、`minegen`、`new_game_desc`、`open_square`，以及 `random.c`；[官方源码包](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/puzzles.tar.gz)。
- **[S3]** Simon Tatham, [Portable Puzzle Collection 通用文档：game ID 与 random seed](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/common.html#common-id)。
- **[S4]** David N. Hill, [JSMinesweeper README（固定提交）](https://github.com/DavidNHill/JSMinesweeper/blob/01eafd3fea4e95c7c692f231c5088fc7a1f0dc00/README.md#L18-L142)。
- **[S5]** David N. Hill, [JSMinesweeper `createNoGuessGame`（固定提交）](https://github.com/DavidNHill/JSMinesweeper/blob/01eafd3fea4e95c7c692f231c5088fc7a1f0dc00/Minesweeper/client/MinesweeperGame.js#L366-L519)。
- **[S6]** David N. Hill, [JSMinesweeper brute-force 限制与 solution 存储（固定提交）](https://github.com/DavidNHill/JSMinesweeper/blob/01eafd3fea4e95c7c692f231c5088fc7a1f0dc00/Minesweeper/client/BruteForceAnalysis.js#L5-L28)。
- **[S7]** Richard Kaye, [“Minesweeper is NP-complete”](https://doi.org/10.1007/BF03025367), *The Mathematical Intelligencer* 22, 9-15 (2000)。
- **[S8]** Chris Studholme, [Minesweeper as a Constraint Satisfaction Problem 项目主页](https://www.cs.toronto.edu/~cvs/minesweeper/) 与[原始论文 PDF](https://www.cs.toronto.edu/~cvs/minesweeper/minesweeper.pdf)（2001）。
- **[S9]** WHATWG, [HTML Living Standard: Web workers](https://html.spec.whatwg.org/multipage/workers.html#workers) 与 [worker event loop](https://html.spec.whatwg.org/multipage/workers.html#worker-event-loop)。
- **[S10]** WHATWG, [HTML Living Standard: transferable objects](https://html.spec.whatwg.org/multipage/structured-data.html#transferable-objects) 与 [StructuredSerializeWithTransfer](https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializewithtransfer)。
- **[S11]** Ecma International, [ECMAScript `Math.random`](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.random)。
- **[S12]** Z3 Project, [官方 TypeScript/Wasm bindings](https://github.com/Z3Prover/z3/tree/master/src/api/js) 与 [package browser 入口](https://github.com/Z3Prover/z3/blob/master/src/api/js/package.json)。
- **[S13]** npm registry, [`z3-solver@5.0.0` registry 元数据](https://registry.npmjs.org/z3-solver/5.0.0)。
