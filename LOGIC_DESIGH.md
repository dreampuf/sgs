# 逻辑实现设计

  logic.js 为逻辑部分主要实现.  
  逻辑实现部分分为 `游戏流程` , `人物操作` , `卡牌功能`  
  视图主要与 sgs.bout 交互.传递操作结果,经过逻辑运算后,将返回下一个选择的 sgs.operate . 

# 参数设置

- **sgs.PLAYER\_NUM** 最大玩家数.
- **sgs.DELAY** 操作延迟,默认1000ms.

# 游戏流程

## 初始化游戏

- 初始化舞台.

  包括玩家信息输入,身份抽取,角色选择.  
  重写玩家对象的**choice\_card**和**ask\_card**方法.  
  **choice\_card**: 主动出牌(出牌阶段).  
  **ask\_card**: 被动出牌(响应出牌).

- 初始化逻辑控制.

  new sgs.bout, 将上面输入的信息传入.

- 绑定事件.
  游戏中的胜负,判断...操作时没有完成的界面与逻辑操作流程,需要出现可打断的流程.所以需要事件系统负责.

## 游戏循环操作

### 判定
### 摸牌

- 事件

  **get\_card(Player, Card[])** 玩家拿牌.

### 出牌

- 事件

  **equip\_on(Player, Card)** 玩家装备装备.
  **choice\_card(Player\_Source or Player\_Source[], Player\_Target or Player\_Target[], Card)** 源目标对目标使用卡牌. 

### 弃牌 



