# 当前设计文档

这里保存仍然影响当前产品方向的设计方案，以及这些方案在代码中的接线状态。

## 推荐阅读顺序

1. [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md)：先看哪些设计已经进入默认运行时、哪些仍只是方案。
2. [`gameplay-overhaul-2026-09-07/README.md`](gameplay-overhaul-2026-09-07/README.md)：全游戏机制、玩法循环和 UI/UX 的重做决策。
3. [`roleplay-context-v2/README.md`](roleplay-context-v2/README.md)：角色扮演优先的场景、上下文、认知、记忆和模型体系。

## 全游戏重做

详见 [`gameplay-overhaul-2026-09-07/`](gameplay-overhaul-2026-09-07/)。该目录包含机制审计、规则蓝图、人物面板、UI/UX、据点与装备、大量角色、关联世界状态和验收路线。

目录内的 `probes.mjs`、`storage-equipment-probes.mjs` 及其 JSON 结果是局部规则复现，不等同于完整游戏试玩。

## 角色扮演上下文与模型

详见 [`roleplay-context-v2/`](roleplay-context-v2/)。该目录按以下职责拆分：

- [`context-memory.md`](roleplay-context-v2/context-memory.md)：上下文、场景、认知和长期记忆。
- [`model-prompts.md`](roleplay-context-v2/model-prompts.md)：Resolver、Narrator、压缩和修复协议。
- [`implementation.md`](roleplay-context-v2/implementation.md)：实施顺序、迁移、回归案例和发布门槛。

如果方案与源码不一致，以源码和 [`../CURRENT_ARCHITECTURE.md`](../CURRENT_ARCHITECTURE.md) 为准；如果方案之间冲突，以日期更新、范围更具体的重做决策为准。
