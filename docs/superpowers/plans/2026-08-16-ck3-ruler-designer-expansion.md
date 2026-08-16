# CK3 Ruler Designer Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 扩展为拥有 100+ CK3 特质和完整自建家族纹章编辑器的二维统治者设计界面。

**Architecture:** 特质数据与选择规则保留在独立数据模块，CK3 图标由导入脚本批量生成；家族纹章由可序列化配置和共享 SVG/CSS 渲染组件负责。创建器只组合状态、筛选和表单，角色卡复用同一个纹章渲染器。

**Tech Stack:** React 19、TypeScript、Zustand、Tailwind CSS、Lucide React、Vite、Python Pillow。

**Spec:** `docs/superpowers/specs/2026-08-16-ck3-ruler-designer-expansion.md`

## Global Constraints

- 可选特质不少于 100 个，分类为性格、教育、生活方式、先天、健康、名声。
- 游戏内容优先使用 CK3/AGOT 原版图标，通用控件使用 Lucide。
- 所有源码、运行时文本和资源元数据禁止 Emoji。
- 保留 400 点设计预算、六项能力和经典原著剧本页签。
- 不制作人物 3D，390px 窄屏不得横向溢出。

---

### Task 1: 扩展验收检查

**Files:**
- Modify: `scripts/check-character-creator.mjs`
- Modify: `scripts/check-game-icons.mjs`

**Interfaces:**
- Consumes: 当前源码静态结构和 `public/assets/game-icons`。
- Produces: 对 100+ 特质、六分类、搜索、自建家族、纹章字段和特质资源的失败检查。

- [x] 写入新断言并运行，确认当前实现失败。
- [x] 保持失败输出具体到缺失能力。

### Task 2: 特质目录与 CK3 图标

**Files:**
- Modify: `src/data/characterTraits.ts`
- Modify: `scripts/import-game-icons.py`
- Modify: `src/components/GameIcon.tsx`
- Generate: `public/assets/game-icons/trait-*.webp`
- Modify: `public/assets/game-icons/manifest.json`

**Interfaces:**
- Produces: `TraitCategory` 六分类、`CHARACTER_TRAITS` 100+ 条目、所有条目的 `GameIconId` 和文件。

- [x] 先让数量和分类检查失败。
- [x] 增加目录及互斥组、价格、能力修正。
- [x] 批量导入对应 CK3 DDS 并注册动态特质图标路径。
- [x] 运行创建器和图标检查直至通过。

### Task 3: 自定义纹章领域模型与渲染

**Files:**
- Create: `src/data/heraldry.ts`
- Create: `src/components/CoatOfArms.tsx`
- Modify: `src/types/game.ts`
- Modify: `src/components/CharacterSheet.tsx`

**Interfaces:**
- Produces: `CoatOfArmsDesign`、纹章选项常量、`CoatOfArms` 共享渲染组件、`LordProfile.coatOfArms`。

- [x] 写静态结构检查并确认失败。
- [x] 实现可序列化的盾形、底纹、颜色和徽记模型。
- [x] 实现预设家徽与自定义纹章的统一渲染。
- [x] 在角色卡复用渲染并通过类型检查。

### Task 4: 创建器特质浏览器

**Files:**
- Modify: `src/components/CharacterCreator.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: 六分类 `CHARACTER_TRAITS`。
- Produces: `traitSearch` 搜索状态、分类计数、可滚动结果网格、详细描述和已选特质条。

- [x] 增加搜索与空结果状态。
- [x] 将分类栏改为六项响应式标签。
- [x] 将结果区改为固定视觉高度的 CK3 式浏览器。
- [x] 验证互斥、上限和设计点仍正确。

### Task 5: 自建家族编辑器与保存

**Files:**
- Modify: `src/components/CharacterCreator.tsx`
- Modify: `src/services/promptBuilder.ts`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `CoatOfArmsDesign` 与 `CoatOfArms`。
- Produces: 预设/自建家族切换、家族名/宗族名/箴言/根据地/文化/信仰表单、纹章配置，并写入 `LordProfile`。

- [x] 增加“创建新家族”模式及必填校验。
- [x] 增加纹章编辑器和实时预览。
- [x] 让开场文本、装备命名和剧情状态切片使用有效家族信息。
- [x] 运行创建器检查和 TypeScript 构建。

### Task 6: 视觉与交互验证

**Files:**
- Modify as needed: `src/components/CharacterCreator.tsx`, `src/index.css`

**Interfaces:**
- Produces: 桌面与 390px 窄屏均可用的最终界面。

- [x] 运行 `npm run verify`。
- [x] 在生产预览中验证特质搜索、互斥替换、自建家族、纹章变化、完成按钮和角色卡。
- [x] 检查无破损图片、控制台错误、失败请求、Emoji 和横向溢出。
- [x] 清理临时 QA 文件与预览进程。
