# 历史设计与实施记录

`superpowers/` 保存按日期记录的历史决策，分为设计规格和实施计划两类。它们用于追溯为什么做过某个选择，不自动覆盖当前代码或当前设计。

## 两类文件

- [`specs/`](specs/)：问题定义、约束、方案和验收标准。
- [`plans/`](plans/)：具体实施步骤、验证记录和收尾状态。

两边不是严格的一对一关系：当前共有 26 份规格和 32 份计划，部分早期探索只有计划，部分规格后来被合并到新的全局设计中。

## 仍值得优先查阅的历史主题

| 主题 | 规格 | 计划 |
| --- | --- | --- |
| 项目结构收敛 | [`specs/2026-08-21-project-structure-consolidation-design.md`](specs/2026-08-21-project-structure-consolidation-design.md) | [`plans/2026-08-21-project-structure-consolidation.md`](plans/2026-08-21-project-structure-consolidation.md) |
| 活世界数据基础 | [`specs/2026-08-21-living-world-data-foundation-design.md`](specs/2026-08-21-living-world-data-foundation-design.md) | [`plans/2026-08-21-living-world-data-foundation.md`](plans/2026-08-21-living-world-data-foundation.md) |
| 项目收尾与运行时完整性 | [`specs/2026-08-21-project-closure-and-runtime-integrity-design.md`](specs/2026-08-21-project-closure-and-runtime-integrity-design.md) | [`plans/2026-08-21-project-closure-and-runtime-integrity.md`](plans/2026-08-21-project-closure-and-runtime-integrity.md) |
| 普通物品所有权 | [`specs/2026-08-21-ordinary-item-ownership-authority-design.md`](specs/2026-08-21-ordinary-item-ownership-authority-design.md) | [`plans/2026-08-21-ordinary-item-ownership-authority.md`](plans/2026-08-21-ordinary-item-ownership-authority.md) |
| 三维地标模型 | [`specs/2026-08-21-agot-3d-landmark-model-import-design.md`](specs/2026-08-21-agot-3d-landmark-model-import-design.md) | [`plans/2026-08-21-agot-3d-landmark-model-import.md`](plans/2026-08-21-agot-3d-landmark-model-import.md) |
| 地标光照 | [`specs/2026-08-21-agot-cinematic-landmark-lighting-design.md`](specs/2026-08-21-agot-cinematic-landmark-lighting-design.md) | [`plans/2026-08-21-agot-cinematic-landmark-lighting.md`](plans/2026-08-21-agot-cinematic-landmark-lighting.md) |

查历史文件时，先看日期和目录，再回到 [`../CURRENT_ARCHITECTURE.md`](../CURRENT_ARCHITECTURE.md) 核对是否仍然有效。
