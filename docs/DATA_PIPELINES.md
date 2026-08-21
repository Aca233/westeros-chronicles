# 数据流水线

运行时只消费仓库中的静态产物，不读取 Steam、Workshop、真实模组目录或网络地图服务。导入器必须由开发者显式调用；验证套件只使用 fixture 和已生成产物进行确定性检查。

| 资料 | 输入 | 生成器 | 输出 | 运行时限制 |
|---|---|---|---|---|
| 地图 | 开发者提供的 AGOT 离线模组 | `scripts.agot_map_import`（`npm run import:agot-map`） | `public/data/agot-map`、`public/assets/agot-map` | 浏览器只读本地静态清单、索引与瓦片。 |
| 人物 | 开发者提供的 AGOT 离线模组 | `scripts.agot_character_import`（`npm run import:agot-characters`） | `public/data/agot-characters` | 运行时按索引和分片读取，不访问原模组。 |
| 卷宗补充 | `scripts/data/character-dossier` | `scripts/compile_dossier_supplements.mjs` | `src/data/generated/characterDossierSupplements.ts` | 生成结果随应用打包，不在浏览器内重新编译。 |
| 神器 | 开发者提供的 AGOT 离线模组 | `scripts.agot_artifact_import`（`npm run import:agot-artifacts`） | `src/data/generated/agotArtifactDefinitions.ts`、`src/data/generated/agotArtifactWorldState.ts` 与相关图片 | `verify` 只测试 fixture 和已提交产物，不执行真实导入。 |
| 3D 地标 | 开发者提供的 AGOT 模型与显式转换器 | `scripts.agot_model_import`（`npm run import:agot-models`） | `public/data/agot-map/models`、`public/assets/agot-map/models` | 运行时只加载本地 manifest、GLB 与纹理，不访问模组目录。 |

## 生成产物规则

- `src/data/generated`、`public/data` 和 `public/assets` 中由生成器声明管理的文件不得手工修改；应修改源资料、覆盖配置或生成器后重新生成。
- 真实导入可读取本机离线数据，但不得被 `verify`、`verify:quick`、`verify:map` 或 `verify:world-linkage` 隐式触发。
- 导入器不得依赖网络下载；来源路径由开发者显式提供，并且不能写入浏览器运行时代码。
- 相同输入、配置与工具版本必须产生顺序稳定、哈希可复现的输出。审计失败时保留上一份完整产物，不能发布部分目录。
- 大型地图瓦片、模型和生成目录仍是正式运行时资源；结构整理不得删除、压缩或重新解释这些数据。
