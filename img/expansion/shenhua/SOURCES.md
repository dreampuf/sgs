# 神话再临早期扩展素材来源

## 版本依据

本项目选择最早期的三个普通武将扩充包和一个游戏牌扩充包：

| 扩展 | 发行时间 | 本项目接入范围 |
| --- | --- | --- |
| 神话再临·风 | 2009-03 | 8名普通武将 |
| 军争篇 | 2009-09-21 | 完整52张游戏牌 |
| 神话再临·火 | 2009-11-16 | 8名普通武将 |
| 神话再临·林 | 2010-07-29 | 8名普通武将 |

发行顺序和月份以[游卡企业历程](https://www.yokaverse.com/about-history/)为主；具体日期交叉参考当年的发行报道：

- [风包在2009年3月的同期预告](https://news.17173.com/content/2009-03-06/20090306103712008.shtml)
- [军争篇于2009年9月21日发布，共52张牌](https://games.sina.com.cn/o/z/sanguosha/2011-09-23/1706425569.shtml)
- [火于2009年11月16日全国发售](https://games.sina.com.cn/o/n/2009-11-11/1224351968.shtml)
- [林于2010年7月29日在ChinaJoy现场发售](https://game.zol.com.cn/188/1888124.html)

风包同期报道对具体日期有3月15日、3月23日等不同记录，游卡企业历程只确认2009年3月，因此代码不再伪造日级精度。军争、火、林的日级日期均有对应发行资料。

武将技能绑定和军争篇52张牌的花色、点数，以 QSanguosha `Guixin` 标签对应提交 `b3b5ad83e7ed758ea2524b325528d2d507eb7f98` 的包源码复核：

- [`wind.cpp`](https://github.com/Mogara/QSanguosha/blob/b3b5ad83e7ed758ea2524b325528d2d507eb7f98/src/wind.cpp)
- [`firepackage.cpp`](https://github.com/Mogara/QSanguosha/blob/b3b5ad83e7ed758ea2524b325528d2d507eb7f98/src/firepackage.cpp)
- [`thicket.cpp`](https://github.com/Mogara/QSanguosha/blob/b3b5ad83e7ed758ea2524b325528d2d507eb7f98/src/thicket.cpp)
- [`maneuvering.cpp`](https://github.com/Mogara/QSanguosha/blob/b3b5ad83e7ed758ea2524b325528d2d507eb7f98/src/maneuvering.cpp)

该版本的 `wind.cpp` 明确注明小乔和于吉不在此包源码文件中，所以不能把单个源码文件误当成完整的实体风包清单；本项目的8名普通武将清单同时以同期发行资料交叉核对。

## 素材

素材来自 [Mogara/QSanguosha](https://github.com/Mogara/QSanguosha)。上游仓库标记为 GPL-3.0；这里记录的是可审计的上游出处，不额外声称拥有游卡商标或原始插画版权。

下载固定到两个不可变提交，避免以后 `master` 更新导致素材静默变化：

- `85baa7489157c023bb2528a40ce4ef4e12863387`：武将牌、军争篇基本牌/锦囊牌、装备条。
- `b3b5ad83e7ed758ea2524b325528d2d507eb7f98`：新版目录中已移除的早期军争牌面。

当前目录保存24名普通武将、11种军争篇牌面和3张独立装备条，并从武将牌统一派生两种旧界面头像尺寸。神将和技能语音不在本次接入范围，详见项目根目录的 `CONTENT_AUDIT.md`。

运行以下命令可以重新下载全部38个上游文件。脚本会逐个校验 SHA-256，再原子替换目标文件；在 macOS 上还会用统一裁剪参数生成24组 `141x144` 大头像和 `137x62` 小头像，避免把完整武将牌直接塞进旧头像框。

```sh
npm run assets:early
```

如只需要验证上游源图而不生成头像，可运行：

```sh
node scripts/fetch-early-expansion-assets.mjs \
  --output-root /tmp/sgs-assets \
  --skip-portraits
```
