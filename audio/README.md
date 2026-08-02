# SGS 原创程序化音频

这里保存的不是一次性导出的黑盒音频，而是一条可重复、可增量、
可追溯的生成流水线。

## 目录职责

- `specs/catalog.json`：人工可编辑的唯一音色与作曲规格，包含固定随机种子。
- `generated/scores/`：生成音乐时实际使用的逐音符、逐打击事件。
- `generated/envelopes/`：音效各合成层及参数的规范化中间表示。
- `generated/wav/`：编码前的无损 PCM 母带。
- `generated/receipts/`：输入哈希、生成器哈希、输出哈希、命令与文件清单。
- `specs/heroes.json`：49 名英雄的动机、音色、技能/专属牌和原创台词。
- `generated/heroes/<英雄 ID>/`：英雄乐谱、音效包络、台词脚本、
  原始 AIFF、标准化 WAV 和逐英雄收据。
- `public/audio/`：游戏运行时加载的 OGG 与发布目录。

以上目录除临时文件外都应进入版本控制。这样可以从任意最终音频反查：

```text
发布 OGG
  -> receipt 输出哈希
  -> WAV 母带
  -> score/envelope 中间表示
  -> catalog 中的参数与 seed
  -> 对应版本的 scripts/generate-audio.mjs
```

## 生成与增量调整

```bash
# 生成缺失或输入哈希已经变化的素材
npm run audio:generate

# 只调整并重新生成一项
npm run audio:generate -- --id card.lightning

# 强制重新渲染一项，用于验证确定性
npm run audio:generate -- --id music.story.qun --force

# 检查规格、收据和所有发布文件是否一致，不改文件
npm run audio:verify

# 查看可用素材 ID
npm run audio:generate -- --list

# 增量生成全部英雄声音包
npm run audio:heroes

# 只重新生成一个英雄
npm run audio:heroes -- --id 'standard:hero:关羽'

# 校验全部英雄中间产物、收据和发布文件
npm run audio:heroes:verify
```

增量微调时只修改 `specs/catalog.json` 中对应条目的参数。生成器按
“生成器内容 + 单项规格”计算输入哈希；未变化的条目不会重绘。音乐的
`scores/*.json` 会明确记录每个声部的音高、起止时间、力度和声像，
便于判断某次修改究竟改变了编曲还是音色。

## 自适应战局音乐

`music.opening`、`music.battle`、`music.advantage`、
`music.dominant`、`music.disadvantage`、`music.critical` 和
`music.comeback` 属于同一个 `adaptiveGroup`。它们使用相同 BPM、
八小节长度、调式与和声周期，因此运行时可以保持循环相位并进行
1.8 秒等功率交叉淡化。

`src/browser/adaptive-music.ts` 只读取桌面公开信息来判断开局、平势、
顺风、大优势、劣势、一血危急和逆转。它不会使用尚未公开的真实身份，
避免背景音乐泄露阵营。普通状态必须连续出现两次才切换；一血危急立即
切换；从劣势或危急恢复到顺风时进入并保持一回合逆转音乐。

调整情绪判断阈值时修改 `adaptive-music.ts`；调整具体听感时只修改
`specs/catalog.json` 中对应 `music.*` 条目，然后按 ID 增量生成。

## 英雄主题、音效与台词

每名英雄都有一个四小节、96 BPM 的专属动机。它与战局音乐同属
`battle-96-a`，选将发牌后先播放英雄主题，再根据局势无缝过渡到
平势、顺风、危急等背景音乐。

英雄技能或配置的专属牌首次触发时播放专属音效和台词；五秒内的连续
触发会合并，避免连弩、群体牌和技能转换牌造成语音轰炸。阵亡时播放
该阵亡英雄的死亡台词，本地玩家胜利时播放其胜利台词。事件首先被转成
纯 JSON cue，因此 JSONL 回放可以比较声音序列而无需真实播放。

英雄素材的追溯链是：

```text
specs/heroes.json 中的人物动机、文案与 inspiration
  -> theme-score / signature-envelope / voice-script
  -> macOS say 原始 AIFF（保留音色名与语速）
  -> ffmpeg 标准化 WAV（保留滤镜参数）
  -> 发布 OGG
  -> receipt 中的系统版本、构建号、生成器与全部文件哈希
```

系统语音在同一 macOS 构建与同一 voice 下可重复生成；系统升级可能
更新 voice 数据，所以跨系统不承诺位级一致，收据会把这种环境变化
识别为输入变化。要微调一名英雄，只改 `specs/heroes.json` 的对应条目
并带 `--id` 生成，不会触碰其他英雄。

## 后台与失焦播放策略

页面进入 `hidden` 或窗口触发 `blur` 时，运行时立即暂停背景音乐、
停止正在播放的音效、取消尚未开始的延迟语音并挂起 `AudioContext`。
页面重新可见且窗口获得焦点后，仅当用户原本允许音乐时才从原曲进度
继续播放；用户关闭的音乐或音效不会被自动打开。后台期间错过的短音效
不会在恢复后补播，以免回到游戏时集中播放过期声音。

## 原创与授权

全部声音由本仓库的确定性波形、噪声和乐谱算法从零合成，不采样、
不模仿或复用商业游戏音频。英雄台词只借鉴公版文学人物、事件和人物
气质，均为本项目原创改写，不复制任何商业游戏的台词或配音。
