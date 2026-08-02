# 三国文本素材库

这里保存未来生成英雄、剧情、台词、场景和音频素材时使用的原始文本依据。它是设计语料，不进入游戏运行时资源包。

## 已收录

| 语料 | 版本 | 用途定位 | 结构 |
| --- | --- | --- | --- |
| 《三國演義》 | 维基文库繁体、毛宗岗评改 120 回本 | 人物性格、戏剧场景、事件铺陈、文学化台词 | 120 个正文回目，另含目录、序与凡例 |
| 《三國志》 | 维基文库繁体、陈寿撰、裴松之注 65 卷本 | 人物经历、关系、官职、年代和史实交叉核对 | 65 卷正文，另含目录及附录 |
| 《成语典》资料下载 | 台湾教育部门公开的 2026-06-25 数据快照 | 从文本中发现成语候选并核对典源 | 原始 ZIP 保持不改写，派生层只保存命中词、编号和出处字段 |

原始 EPUB 位于 `raw/`；适合程序消费的逐回/逐卷 JSONL 位于 `corpus/`。每行都是一个独立 JSON 对象，包含作品、证据类别、顺序、回/卷号、标题、来源页、EPUB 内部路径和正文。

整理后的时间线、人物、地点、故事、相貌、典籍和成语资料位于 `knowledge/`，字段、证据层级、检索方法及限制见 [`knowledge/README.md`](knowledge/README.md)。其中 `visual-passages-curated.jsonl` 是经过人工校准的英雄造型依据；`appearance-passages.jsonl` 是自动发现层，不能未经复核就直接生成素材。

《三國演義》被标记为 `literary-narrative`，《三國志》被标记为 `historical-record`。生成系统必须保留这个区别：演义中的桥段不能自动写成史实；《三國志》也不是现代学术结论，重要事实仍需二次核对。

## 可追溯性

`manifest.json` 记录：

- 下载及准备时间；
- 来源页与 WS Export 下载地址；
- 版本说明、作者和语料类型；
- 原始 EPUB、派生 JSONL 的字节数和 SHA-256；
- 实际提取的记录数及正文回/卷数。

古籍原作属于公版。维基文库贡献者整理的页面文本依来源页所示的创用 CC 姓名标示-相同方式分享条款提供；再分发或将原文直接写入成品时，应保留来源和署名，并重新核对届时条款。不要把维基文库标志或 EPUB 包装素材用作游戏美术。

《成语典》下载页将相关资料标示为 CC BY-ND 3.0 TW。因此仓库保存官方 ZIP 原样快照和哈希；不要发布经过改写、删列或重排后却仍冒充官方资料库的副本。`idiom-matches-moe.jsonl` 是本项目独立生成的命中索引，不复制释义全文。

## 更新语料

在本目录运行：

```sh
node scripts/prepare-source-corpus.mjs
```

脚本会重新从 Wikimedia WS Export 下载两份 EPUB，验证 ZIP 完整性，提取正文并重写 `manifest.json`。如果只想从已下载的 EPUB 重建派生语料：

```sh
node scripts/prepare-source-corpus.mjs --reuse
node scripts/build-knowledge-base.mjs
```

更新后必须检查 SHA-256、回/卷数以及首末标题。来源会持续编辑，因此文件哈希发生变化并不等于内容有问题，但必须 review 差异后再用于增量生成。

## 使用建议

先按人物、事件或回/卷检索，不要把两部长文本不加选择地塞进同一个模型上下文。例如：

```sh
jq -r 'select(.kind == "chapter" and (.text | contains("張角"))) | [.workTitle, .chapterLabel, .title, .sourcePage] | @tsv' corpus/*.jsonl
```

未来生成资产时，建议把每次输入的 `work`、`chapter`、`sourcePage`、语料文件 SHA-256、提示词版本和生成参数一并写入资产 provenance；这样可以对人物台词或剧情选择追溯到具体文本快照。
