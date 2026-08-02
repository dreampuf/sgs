# 首页背景资产

首页使用“背景美术 + HTML/CSS UI”两层结构。背景图片中不得包含标题、按钮、
进度、阵营名称或其他可读文字；所有交互内容由 `index.html`、`css/css.css` 和
`main.js` 渲染。

## 运行时映射

| 模式或阵营 | 阵营色 | 运行时背景 |
| --- | --- | --- |
| 标准身份场 | 魏蓝、蜀绿、吴红、群暗金 | `img/system/home/background-identity.jpg` |
| 魏传 | 深钴蓝 | `img/system/home/background-story-wei.jpg` |
| 蜀传 | 玉石绿 | `img/system/home/background-story-shu.jpg` |
| 吴传 | 朱砂红 | `img/system/home/background-story-wu.jpg` |
| 群雄传 | 炭黑、旧金 | `img/system/home/background-story-qun.jpg` |

无损 PNG 源稿位于 `docs/design/background-sources/`。运行时 JPEG 由源稿以
88% 质量生成，尺寸均为 1672×941。早期整页概念稿位于
`docs/design/homepage-concept-v1.png` 和
`docs/design/homepage-concept-v2.png`，只用作视觉方向参考，不进入生产包。

## 生成约束

所有背景共用以下约束：

- 16:9、三国历史策略卡牌、成熟的电影化水墨写实风格。
- 左上为代码标题保留安静区域，右侧为代码导航保留可读区域。
- 只生成背景美术，不生成 UI、按钮、面板、标题、图标、文字或水印。
- 魏为蓝、蜀为绿、吴为红、群雄为炭黑与旧金，不得互换。

各阵营主题：

- 魏：陈留起兵到官渡决战，北方军营、骑兵、粮仓和军阵。
- 蜀：桃园结义到长坂突围，桃林、誓师台、三位同行者与远方关隘。
- 吴：江东定策到赤壁烈焰，长江、水军、战船与克制的火光。
- 群：黄巾起义到董卓入京，广宗风暴、祭坛、乱军与暗金旗帜。

新增场景级背景时，命名为
`background-story-<faction>-<scenario-id>.jpg`，并在 `main.js` 的
`HOME_SCENARIO_BACKGROUNDS` 中登记。运行时优先使用场景 ID 对应的背景；没有
登记场景专属图时回退到当前阵营背景。
