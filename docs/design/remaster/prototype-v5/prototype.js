const params = new URLSearchParams(window.location.search);
const requestedPlayerCount = Number(params.get("players"));
const playerCount = requestedPlayerCount === 20 ? 20 : 4;
const shell = document.querySelector(".game-shell");
const opponents = document.querySelector(".opponents");
const toggle = document.querySelector("#player-count-toggle");
const detail = document.querySelector("#seat-detail");
const detailClose = document.querySelector("#seat-detail-close");

shell.dataset.playerCount = String(playerCount);
opponents.dataset.density = playerCount === 20 ? "micro" : "normal";
toggle.href = playerCount === 20 ? "?players=4" : "?players=20";
toggle.textContent = playerCount === 20 ? "4 人" : "20 人";

const extraPlayers = [
  ["曹操", "caocao", "wei", "魏", 4, 5, "奸雄、护驾", "绝影", "无延时牌"],
  ["张辽", "zhangliao", "wei", "魏", 3, 4, "突袭", "青釭剑", "乐不思蜀"],
  ["司马懿", "simayi", "wei", "魏", 3, 6, "反馈、鬼才", "八卦阵", "闪电"],
  ["夏侯惇", "xiahoudun", "wei", "魏", 4, 2, "刚烈", "仁王盾", "无延时牌"],
  ["关羽", "guanyu", "shu", "蜀", 4, 3, "武圣", "赤兔", "兵粮寸断"],
  ["张飞", "zhangfei", "shu", "蜀", 3, 7, "咆哮", "丈八蛇矛", "无延时牌"],
  ["赵云", "zhaoyun", "shu", "蜀", 4, 4, "龙胆", "爪黄飞电", "无延时牌"],
  ["诸葛亮", "zhugeliang", "shu", "蜀", 3, 5, "观星、空城", "无装备", "闪电"],
  ["孙权", "sunquan", "wu", "吴", 4, 6, "制衡、救援", "大宛", "无延时牌"],
  ["周瑜", "zhouyu", "wu", "吴", 3, 5, "英姿、反间", "古锭刀", "乐不思蜀"],
  ["甘宁", "ganning", "wu", "吴", 4, 2, "奇袭", "诸葛连弩", "无延时牌"],
  ["吕蒙", "lvmeng", "wu", "吴", 4, 8, "克己", "白银狮子", "无延时牌"],
  ["貂蝉", "diaochan", "qun", "群", 3, 4, "离间、闭月", "无装备", "兵粮寸断"],
  ["华佗", "huatuo", "qun", "群", 3, 5, "急救、青囊", "的卢", "无延时牌"],
  ["甄姬", "zhenji", "wei", "魏", 3, 6, "倾国、洛神", "无装备", "闪电"],
  ["大乔", "daqiao", "wu", "吴", 3, 3, "国色、流离", "紫骍", "乐不思蜀"]
];

function createSeat([name, asset, factionClass, factionName, hp, cards, skills, equipment, status], index) {
  const seat = document.createElement("article");
  seat.className = `seat faction-${factionClass}`;
  seat.tabIndex = 0;
  seat.dataset.skills = skills;
  seat.dataset.equipment = equipment;
  seat.dataset.status = status;
  seat.innerHTML = `
    <img class="seat-portrait" src="/img/generals/big/${asset}.png" alt="${name}">
    <div class="seat-info">
      <header><strong>${name}</strong><span class="faction">${factionName}</span><span class="identity">${index % 5 === 0 ? "内" : "反"}</span></header>
      <div class="seat-state"><b>${hp}</b><span class="hp">${"● ".repeat(Math.max(1, Math.min(hp, 4))).trim()}</span><span>${cards} 手牌</span></div>
      <div class="skill-row">${skills.split("、").map((skill) => `<button type="button">${skill}</button>`).join("")}</div>
      <div class="status-row"><span>${equipment}</span><span class="delayed">${status}</span></div>
    </div>`;
  return seat;
}

if (playerCount === 20) {
  extraPlayers.forEach((player, index) => opponents.append(createSeat(player, index)));
}

function showSeatDetail(seat) {
  const name = seat.querySelector("header strong")?.textContent ?? "玩家";
  const state = seat.querySelector(".seat-state")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  detail.querySelector("strong").textContent = name;
  detail.querySelector(".seat-detail-state").textContent = state;
  detail.querySelector(".seat-detail-skills").textContent = `技能：${seat.dataset.skills ?? "无"}`;
  detail.querySelector(".seat-detail-equipment").textContent = `装备：${seat.dataset.equipment ?? "无"}`;
  detail.querySelector(".seat-detail-status").textContent = `判定区：${seat.dataset.status ?? "无"}`;
  detail.hidden = false;
  opponents.querySelectorAll(".seat.focused-seat").forEach((item) => item.classList.remove("focused-seat"));
  seat.classList.add("focused-seat");
}

opponents.addEventListener("click", (event) => {
  const seat = event.target.closest(".seat");
  if (seat) showSeatDetail(seat);
});

opponents.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const seat = event.target.closest(".seat");
  if (!seat) return;
  event.preventDefault();
  showSeatDetail(seat);
});

detailClose.addEventListener("click", () => {
  detail.hidden = true;
  opponents.querySelectorAll(".seat.focused-seat").forEach((item) => item.classList.remove("focused-seat"));
});
