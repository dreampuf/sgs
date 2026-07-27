# 神话再临早期扩展素材来源

## 版本依据

本项目选择最早期的三个普通武将扩充包和一个游戏牌扩充包：

| 扩展 | 发行时间 | 本项目接入范围 |
| --- | --- | --- |
| 神话再临·风 | 2009-03-23 | 8名普通武将 |
| 军争篇 | 2009-09 | 完整52张游戏牌 |
| 神话再临·火 | 2009-11-16 | 8名普通武将 |
| 神话再临·林 | 2010-07 | 8名普通武将 |

发行顺序和月份以[游卡企业历程](https://yokaverse.com/about-history/)为主；具体日期交叉参考当年的发行报道：

- [军争篇于2009年9月底上市](https://games.sina.com.cn/o/n/2009-09-09/1049338089.shtml)
- [火于2009年11月16日全国发售](https://games.sina.com.cn/o/n/2009-11-11/1224351968.shtml)
- [林于2010年7月公开、包含8名武将](https://news.mydrivers.com/1/170/170762.htm)

武将名单和军争篇52张牌的花色、点数，以 QSanguosha 早期 `Guixin` 标签的包源码复核：

- [`wind.cpp`](https://github.com/Mogara/QSanguosha/blob/Guixin/src/wind.cpp)
- [`firepackage.cpp`](https://github.com/Mogara/QSanguosha/blob/Guixin/src/firepackage.cpp)
- [`thicket.cpp`](https://github.com/Mogara/QSanguosha/blob/Guixin/src/thicket.cpp)
- [`maneuvering.cpp`](https://github.com/Mogara/QSanguosha/blob/Guixin/src/maneuvering.cpp)

## 素材

素材来自 [Mogara/QSanguosha](https://github.com/Mogara/QSanguosha)（GPL-3.0）：

- 武将牌：`master/image/generals/card/*.jpg`
- 军争篇基本牌和锦囊牌：`master/image/card/*.png`
- 军争篇装备条：`master/image/equips/*.png`
- 早期版本已移除的牌面：`Guixin/image/card/*.jpg`

当前目录保存24名普通武将、11种军争篇牌面和3张独立装备条。神将、技能语音、独立大图和独立小图不在本次接入范围，详见项目根目录的 `CONTENT_AUDIT.md`。
