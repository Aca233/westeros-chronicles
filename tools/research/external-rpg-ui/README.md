# 外部 RPG UI 历史研究工具

本目录保存项目早期用于分析外部 RPG 网页实现的临时研究脚本，供追溯设计来源和人工复查使用。

## 边界

- 这些脚本不是产品运行时代码。
- 这些脚本不是正式 AGOT 数据生成器。
- 这些脚本不得加入 `verify`、`verify:quick`、`verify:map` 或 `verify:world-linkage`。
- `crawl_all.py`、`download_fanren.py`、`download_yishijie.py` 和 `scrape_analyze.py` 会访问网络，只能由开发者显式运行。
- 输入与下载结果位于被 Git 忽略的 `scratch/fanren` 和 `scratch/yishijie`。

## 运行方式

脚本保留原有相对路径语义，应从仓库根目录执行，例如：

```bash
python3 tools/research/external-rpg-ui/analyze_extracted.py
```

不要在 CI、构建流程或离线验证套件中自动调用这些脚本，也不要提交 `scratch/` 中的抓取资料。
