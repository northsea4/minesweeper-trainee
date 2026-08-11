# 领域文档

工程 skills 探索代码库前，应按以下规则读取领域文档。

## 探索前读取

- 仓库根目录的 `CONTEXT.md`
- 若根目录存在 `CONTEXT-MAP.md`，则按其指引读取与当前任务相关的 `CONTEXT.md`
- `docs/adr/` 中与当前工作相关的 ADR
- 在 multi-context 仓库中，还需检查 `src/<context>/docs/adr/`

如果这些文件不存在，静默继续，不要预先建议创建。`/domain-modeling` 会在术语或决策得到确认时按需创建它们。

## 文件结构

本仓库采用 single-context 布局：

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-another-decision.md
└── src/
```

## 使用 glossary 中的词汇

当 issue 标题、重构建议、假设或测试名称涉及领域概念时，应使用 `CONTEXT.md` 定义的术语，不要改用 glossary 明确排除的同义词。

若所需概念尚未收录，应重新判断该词是否属于项目语言；若确有缺口，则记录下来供 `/domain-modeling` 处理。

## 标记与 ADR 的冲突

如果输出与已有 ADR 冲突，必须明确指出，而不是静默覆盖。例如：

> 与 ADR-0007 冲突，但值得重新讨论，因为……
