# 测试与验证

验证入口由 `scripts/verify/suites.mjs` 声明，并由 `scripts/verify/run-suite.mjs` 串行执行。runner 会输出 `[n/total]` 进度，在第一个失败步骤立即停止，并保留该步骤的非零退出码。

## 组合套件

| 命令 | 用途 |
|---|---|
| `npm run verify:quick` | 日常快速边界、核心规则、结构门禁与 code build。 |
| `npm run verify:world-linkage` | 人物、资产、旅行、头衔与世界事务之间的联动验证。 |
| `npm run verify:map` | 地图 schema、瓦片、地形、交互、旅行和 3D 地标验证。 |
| `npm run verify` | 完整验证：保留迁移前 115 个唯一叶子任务，并追加当前结构门禁。 |

所有现有单项 `test:*` 和 `check:*` 命令仍是稳定的调试入口。定位问题时应先运行最窄的相关命令，通过后再运行所属组合套件。

## 结构门禁

快速与完整套件都会运行以下结构检查：

- `npm run test:verification-suites`：验证套件无重复、无递归组合入口且引用的脚本存在。
- `npm run test:domain-contracts`：验证领域叶节点类型和旧入口兼容导出。
- `npm run test:module-cycles`：验证循环检测器夹具及当前源码图。
- `npm run check:module-cycles`：要求 `src` 静态 import/export 图为 0 个循环。

## 数据与外部访问边界

自动验证只运行离线 fixture、已有生成产物审计和本地构建。它不会执行：

- `npm run import:agot-map`
- `npm run import:agot-models`
- `npm run import:agot-characters`
- `npm run import:agot-artifacts`
- 任何网络研究脚本

这些导入命令可能依赖开发者明确提供的本机 AGOT/CK3 文件，应由开发者主动运行，不能作为普通 `verify` 的隐式步骤。
