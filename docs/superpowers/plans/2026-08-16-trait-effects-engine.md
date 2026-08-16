# Trait Effects Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为 CK3 特质增加可确定性结算的非属性效果，并接入 D20、资源、伤病和 AI RP。

**Architecture:** 独立纯函数引擎负责倍率、抗性、检定和权重汇总；特质规则覆盖表与展示数据分离。角色只持久化特质 ID，所有有效效果从目录重建，避免存储派生状态。

**Tech Stack:** TypeScript、Node test、React、Zustand、Vite。

**Spec:** `docs/superpowers/specs/2026-08-16-trait-effects-engine.md`

## Global Constraints

- AI 不计算百分比，仅叙述前端已结算结果。
- D20 修正限制为 -10 到 +10，抗性最高 75%，倍率限制为 -80% 到 +200%。
- 维持 400 点人物设计预算和现有存档兼容。
- 源码和运行时文本禁止 Emoji。

---

### Task 1: 验收与纯函数规则
- [x] 增加失败检查和 Node 单元测试。
- [x] 实现效果类型、汇总、倍率和抗性纯函数。
- [x] 验证边界与叠加规则。

### Task 2: 特质规则数据
- [x] 为性格、生活方式、先天、健康和名声特质配置非属性效果。
- [x] 为全部特质生成 RP 指令。
- [x] 增加规则效果格式化函数。

### Task 3: D20 与状态结算
- [x] 持久化自建角色特质 ID。
- [x] D20 增加领域推断、特质修正和明细。
- [x] 资源获得应用倍率。
- [x] 伤病与异常状态应用前端抗性判定。

### Task 4: AI 与界面
- [x] 状态切片加入有效特质规则和 RP 指令。
- [x] D20 提示词明确特质修正与最终结果。
- [x] 特质卡展示规则效果和 RP 倾向。

### Task 5: 验证
- [x] 运行规则单测和 `npm run verify`。
- [x] 浏览器验证特质详情、D20 明细和无运行时错误。

### Task 6: AGOT Mod 特质
- [x] 导入人物设计器可用的 21 项 AGOT Mod 特质及简体中文原版描述。
- [x] 转换并使用 21 个 AGOT 原版特质图标。
- [x] 将 Mod 特质并入性格、生活方式、先天、健康和名声等 CK3 分类。
- [x] 为 Mod 特质配置 D20、倍率、事件权重和 RP 规则。
