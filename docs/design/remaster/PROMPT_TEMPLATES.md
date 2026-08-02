# 山河铸印生成模板

生成方式：Codex 内置 `imagegen`。所有批次都必须保存完整提示词、原始输出和筛选记录；不可只留下压缩后的游戏资源。

## 公共前缀

```text
Theme: “Seals of the Realm / 山河铸印”, remastered Three Kingdoms digital card game.
Style: premium modern Chinese editorial ink; mature historical strategy-game illustration;
restrained ink-and-color realism; characters, cards and the active event lead the composition;
historically inspired late-Han clothing, armor and objects; restrained engraved bronze,
cool charcoal, mineral ivory, silk and xuan-paper texture; crisp silhouette; minimal ornament.
Lighting: key light from upper front-left, controlled warm antique-gold highlights,
faction color used only as restrained rim light or material accent.
Consistency: match remaster-theme-v5 geometry, line weight, material finish, color logic
and lighting. Natural human skin tones; faction color never lights the face or dominates clothing.
No facial paint, opera mask, repeated generic stern bearded face, anime, chibi, photoreal cosplay,
western fantasy armor, neon, sci-fi, glossy mobile-gacha excess, logo, watermark or readable text.
No muddy sepia wash, thick gold border, carved corner, beveled button, faux wood or leather UI,
nested rectangle grid, old browser-game skin, or decorative texture behind small text.
```

## 英雄母图

在公共前缀后追加：

```text
Create one borderless master hero portrait for {hero_id}: {hero_name},
{age_and_face}, {personality_and_posture}, wearing {historical_clothing_or_armor},
holding or accompanied by {signature_prop}. Faction: {faction}; use {faction_material}
and a restrained {faction_color} accent. The image should communicate {narrative_role}
before costume detail.

Define a face and body that are specific to this person: {skull_shape}, {age_signs},
{hairline_and_hair}, {facial_hair_or_clean_shaven}, {body_type}, {center_of_gravity}.
Do not derive the face, skin light or main costume color from the faction. When viewed beside
other heroes, this person must remain distinguishable in grayscale and without costume.

Vertical 3:4 composition, half body, face occupies 18–24% of image height,
at least 8% clear headroom, hands and signature prop remain inside the central safe area.
Leave enough environmental continuation on every side for desktop seat crop, mobile avatar,
full hero card and story portrait. Restrained battlefield atmosphere tied to {era_or_event}.
No card frame, no UI panel, no faction glyph, no name, no text.
```

生成后必须记录：`focusX`、`focusY`、面部安全区、道具方向和推荐裁切。第一批只生成曹操、刘备、孙权和张角；四张并排审核通过后再继续。

## 卡牌插画母图

在公共前缀后追加：

```text
Create one borderless master card illustration for {card_id}: {card_name}.
Category: {basic|trick|delayed-trick|weapon|armor|mount}.
Depict {single_action_or_object} with one unmistakable silhouette and a clear focal point.
It must remain recognizable when cropped to a 72-pixel-wide playing card.
Keep the upper-left and lower-right corners visually quiet for code-rendered rank, suit and rules.
Use {battlefield_context}; avoid unrelated named heroes unless the card specifically requires one.
Vertical 3:4 composition. No card frame, no card name, no rank, no suit, no rules text,
no expansion mark and no UI.
```

## 剧情与战场背景

在公共前缀后追加：

```text
Create a layered full-screen battlefield background for {scene_id}: {historical_event}.
Faction viewpoint: {faction}. Time and weather: {time_weather}.
Build three readable depth planes: quiet foreground framing, low-contrast playable middle ground,
and atmospheric distant landmarks. Reserve the center 55% for cards, target lines and effects;
reserve the top edge for opponent seats and the bottom edge for the local hand and controls.
No identifiable hero in the focal area, no card, no UI, no text.
Landscape 16:9 master with crop-safe 4:3 and 9:16 regions documented.
```

背景必须与 UI 分层。剧情模式通过场景 ID 加载阵营和年代对应背景，不能把座位框、按钮或标题烘焙进背景图。

## 响应式 UI 概念板

在公共前缀后追加：

```text
Create a presentation board showing the same dense digital card battle in three devices:
desktop 16:9, tablet 4:3 and phone 9:16. Preserve the existing game's spatial topology:
opponents stay in a continuous top region; discard and draw deck stay paired at right-center;
equipment, delayed zones, horizontal hand, contextual actions and local hero form one bottom region.
Use a full-bleed game canvas with no thick bezel or decorative outer margin. Apply an 8px grid:
ordinary gaps 4–8px, major gaps at most 12px. Keep the toolbar at 32px. On a 720px-high desktop,
cap opponent seats at 128px high and the local dock at 154px high; extra height belongs to the elastic
event stage instead of scaling persistent UI. Keep each opponent seat content-sized and no wider than
180px; do not stretch three seats across the full screen. The center may stay calm while idle and shows
phase, active effect, source-to-target relation, response state, discard and deck when relevant.
Let hand cards consume all width left after equipment, actions and hero.
Desktop uses the three dense horizontal regions. Equipment stays close to the current 142-by-25-pixel
narrow horizontal rows with a small icon, name and range/state; never render equipment as card
thumbnails or a large icon grid. Tablet retains the narrow rows and may truncate names.
Phone uses a compact opponent carousel, current-event region, local status row,
hand carousel and at most three primary actions plus overflow. Use cool charcoal translucent ink
layers on dark scenes and mineral-ivory translucent layers on bright scenes. Prefer borderless
portrait strips, 1px separators, integrated status rails and overlapping hand cards over boxed panels.
Use cinnabar only for current action, jade for health and sparse pale gold for exceptional emphasis.
The interface may use subtle map, silk or paper texture but does not need to imitate a physical table.
For a 20-player identity game, show 19 real queryable opponent seats: desktop uses a 10-plus-9
two-row micro grid; tablet uses a two-row horizontal rail; phone uses a one-row horizontal rail.
Micro seats show portrait, name, faction, identity, health and hand count. Skills, equipment and
delayed cards appear in a focused detail panel instead of being permanently squeezed into every seat.
Show selected, available, disabled and responding states through shape, brightness and material,
not color alone. No mock operating-system chrome and no readable placeholder prose.
```

## 审核提示词

每批生成完成后，按以下问题记录通过或淘汰原因：

1. 隐去边框和文字后，英雄或卡牌仍能被识别吗？
2. 缩到 72px 宽后，焦点和动作轮廓还成立吗？
3. 与已经入选的四阵营校准图并排，光向、材质和写实程度一致吗？
4. 是否出现了脸谱、同一张男性脸换衣服、西式板甲、现代物件、霓虹、塑料光泽或不可控文字？
5. 同一母图能否安全裁成英雄卡、座位头像、手机头像和剧情立绘？
6. 图像是否侵占规则层需要使用的角落或中心信息区？
7. 战场是否仍保持现有牌局拓扑，同时避免厚外框、重复 padding、永久空白和松散浮动面板？
