#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MASTER_COMMIT = "85baa7489157c023bb2528a40ce4ef4e12863387";
const GUIXIN_COMMIT = "b3b5ad83e7ed758ea2524b325528d2d507eb7f98";
const RAW_ROOT = "https://raw.githubusercontent.com/Mogara/QSanguosha";

const heroNames = [
  "caopi",
  "caoren",
  "dianwei",
  "dongzhuo",
  "huangzhong",
  "jiaxu",
  "lusu",
  "menghuo",
  "pangde",
  "pangtong",
  "sunjian",
  "taishici",
  "weiyan",
  "wolong",
  "xiahouyuan",
  "xiaoqiao",
  "xuhuang",
  "xunyu",
  "yanliangwenchou",
  "yuanshao",
  "yuji",
  "zhangjiao",
  "zhoutai",
  "zhurong"
];

const expectedSha256 = {
  "img/expansion/shenhua/hero/caopi.jpg":
    "5202e7c9f5fde4af71a25a6e6e5059cc4d7dc8363db2aa02442745b5cb1eaf5f",
  "img/expansion/shenhua/hero/caoren.jpg":
    "1ebfb6501ce3c614bc302bb3b876df6dac2e5088d3ed3ead305d85e21539dd78",
  "img/expansion/shenhua/hero/dianwei.jpg":
    "ce024c5aa9282fd1f11f2c21e408fc7bbb00df5796754d370773e5459f2f44cb",
  "img/expansion/shenhua/hero/dongzhuo.jpg":
    "e05b3af499bfbf5d801982c910b3272b19307ca6683eb727bdc202b298713569",
  "img/expansion/shenhua/hero/huangzhong.jpg":
    "63263ddeeacf54b410716ea566d9a7195be3c17388012f7b3e0da55b714debda",
  "img/expansion/shenhua/hero/jiaxu.jpg":
    "143e67e88c8479cfe6f07dd585217d0eecf2f2e2bc74e1605e9fde1a90d3ec97",
  "img/expansion/shenhua/hero/lusu.jpg":
    "2bf794e0cf0908bfb439942f956963f4574053c6e4e062990ccfcfb8650996ff",
  "img/expansion/shenhua/hero/menghuo.jpg":
    "3bf1be70af68bcceb7e460621bb753deddb91cd1450f679b8ed33f20a5b0a9d3",
  "img/expansion/shenhua/hero/pangde.jpg":
    "84ddd2d246e31aa9429c515314c8c8fbf69da8539c18c662e8d3d12f865187fa",
  "img/expansion/shenhua/hero/pangtong.jpg":
    "9683c45d10283b9618ffd27ab8e2e88c75e2b1bf49075d6fa4a1ac93c7e8a523",
  "img/expansion/shenhua/hero/sunjian.jpg":
    "4ff0c76538ada52f2483bfef72fae8ffbe5c0eefa37e5e0142f04c8b887a9b4b",
  "img/expansion/shenhua/hero/taishici.jpg":
    "7cc807aa74d017d69cff86aa836219506293459fdea40d695474c4bb67d61501",
  "img/expansion/shenhua/hero/weiyan.jpg":
    "46ac966fab549786baef896f7885a6a8ca2ae1f1f8e9cfe0bc1ca38637fe4aff",
  "img/expansion/shenhua/hero/wolong.jpg":
    "7785c39e6cf570de03f8feefd2ccaffa21ee53edeec255e3c45cb8881a7de581",
  "img/expansion/shenhua/hero/xiahouyuan.jpg":
    "6ebf227b22eec340767b6b53728f611cb55503872f1aaf5a3114885255684334",
  "img/expansion/shenhua/hero/xiaoqiao.jpg":
    "ad95a32856103e4b5af9db4ee678cbfca0cc6546756f2e9bd064c589b7e19b42",
  "img/expansion/shenhua/hero/xuhuang.jpg":
    "5885aca1bd7c0cc66d60446db6dc3db38f2db46b7855140fad9b7840ecb60270",
  "img/expansion/shenhua/hero/xunyu.jpg":
    "37c5e00a9c076010f02b4b5499c47570aaa15f676c674ede038700c75899e910",
  "img/expansion/shenhua/hero/yanliangwenchou.jpg":
    "38eeb5ef878817ec68dd3a9a816f6008ee02e2adfcb9d9d8e44eecd586eccb53",
  "img/expansion/shenhua/hero/yuanshao.jpg":
    "1c2925b0630c228aec03dea34300167dca2109bf296433549d238159c60cdca3",
  "img/expansion/shenhua/hero/yuji.jpg":
    "33c5092b2b19ebfbd8c0a8454195ff3bc4f6c585aa106a0624ab512533064b64",
  "img/expansion/shenhua/hero/zhangjiao.jpg":
    "9fdf17ac0d65630f581096d886922f35552decb16fb5758022212ab5ab71f92b",
  "img/expansion/shenhua/hero/zhoutai.jpg":
    "10e423801ba75c1b90574d8f26548d166cfab81051652bd133b533c2866d15b2",
  "img/expansion/shenhua/hero/zhurong.jpg":
    "54c2d30f1aa755605b36d4d25404f1fe5db4863027ed70f9f13e4fc91c185d65",
  "img/expansion/shenhua/card/analeptic.png":
    "c58aa91ac7a429af2c1a1f1ebcc0beca4264d9119adf4b0727da88a09a843216",
  "img/expansion/shenhua/card/fire_attack.png":
    "0a3b31387559f5a1fa3464ffa0cc6511ab55d43a3b2c01f386a9ee8d79523fbd",
  "img/expansion/shenhua/card/fire_slash.png":
    "bc1dcc65d3d63f5b915005e49d8a8bba5fd79e0b16386b4f576ac5d08f88f1a0",
  "img/expansion/shenhua/card/iron_chain.png":
    "ae890cc2663c92351d44c03c8cc472702453c099b502fc1400b3ccb65142011a",
  "img/expansion/shenhua/card/supply_shortage.png":
    "96495bacb3d834bb99af1d751bfcd2c974a663240778a576f44964704b38dc99",
  "img/expansion/shenhua/card/thunder_slash.png":
    "4b35cb09fd4d8ffcb2f9d3ecabf2de04e78c786f92dabc382aec38a678246487",
  "img/expansion/shenhua/card/fan.jpg":
    "04aa4879c700ea1df1d69c35b08f52a4594f7b9a57398961a2b00ef10be8197d",
  "img/expansion/shenhua/card/guding_blade.jpg":
    "02561c38763c93e5f0d2e71043e94becf471cac48f3410d9e9f602159155649e",
  "img/expansion/shenhua/card/hualiu.jpg":
    "44915e9929e993911c462c9d0218ba916c68483dc9dafdc34f0b79bf37d59b5d",
  "img/expansion/shenhua/card/silver_lion.jpg":
    "0c433cebe8be2566779521538550d36011cfc8f061f24e818d5809c3ce7b52e3",
  "img/expansion/shenhua/card/vine.jpg":
    "7bbdeb1ddfdd9fd2b264dabc3348210a5539c3899782a9f6a6613b3e245f21d3",
  "img/expansion/shenhua/equipment/fan.png":
    "43fd9e077dfe7acbaf510cf629c1f305ad7e6a0c6a72ac3ee4c56154ddbbadf2",
  "img/expansion/shenhua/equipment/silver_lion.png":
    "5973a09548521e059107138a89bd1e715fdddcba8af6ee968d63ae90d8bc19fc",
  "img/expansion/shenhua/equipment/vine.png":
    "f51db7f5e8811d67aed150698cd52f5d387a1faf733582a5f65f4f3b355424fc"
};

const assets = [
  ...heroNames.map((name) => ({
    commit: MASTER_COMMIT,
    source: `image/generals/card/${name}.jpg`,
    output: `img/expansion/shenhua/hero/${name}.jpg`
  })),
  ...[
    "analeptic",
    "fire_attack",
    "fire_slash",
    "iron_chain",
    "supply_shortage",
    "thunder_slash"
  ].map((name) => ({
    commit: MASTER_COMMIT,
    source: `image/card/${name}.png`,
    output: `img/expansion/shenhua/card/${name}.png`
  })),
  ...["fan", "guding_blade", "hualiu", "silver_lion", "vine"].map(
    (name) => ({
      commit: GUIXIN_COMMIT,
      source: `image/card/${name}.jpg`,
      output: `img/expansion/shenhua/card/${name}.jpg`
    })
  ),
  ...[
    ["Fan.png", "fan.png"],
    ["SilverLion.png", "silver_lion.png"],
    ["Vine.png", "vine.png"]
  ].map(([source, output]) => ({
    commit: MASTER_COMMIT,
    source: `image/equips/${source}`,
    output: `img/expansion/shenhua/equipment/${output}`
  }))
];

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(
  argumentValue("--output-root") ?? projectRoot
);
const skipPortraits = process.argv.includes("--skip-portraits");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function download(asset) {
  const url = `${RAW_ROOT}/${asset.commit}/${asset.source}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  const expected = expectedSha256[asset.output];
  if (actual !== expected) {
    throw new Error(
      `checksum mismatch for ${asset.output}: expected ${expected}, got ${actual}`
    );
  }
  const destination = path.join(outputRoot, asset.output);
  const temporary = `${destination}.download`;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  process.stdout.write(`downloaded ${asset.output}\n`);
}

function cropPortrait(source, destination, height, width) {
  const result = spawnSync(
    "sips",
    [
      "-c",
      String(height),
      String(width),
      "--cropOffset",
      "34",
      "30",
      source,
      "--out",
      destination
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sips failed");
  }
}

async function createPortraits() {
  if (process.platform !== "darwin") {
    throw new Error(
      "portrait generation requires macOS sips; pass --skip-portraits " +
      "to download source images only"
    );
  }
  for (const name of heroNames) {
    const source = path.join(
      outputRoot,
      `img/expansion/shenhua/hero/${name}.jpg`
    );
    const big = path.join(
      outputRoot,
      `img/expansion/shenhua/portrait/big/${name}.jpg`
    );
    const small = path.join(
      outputRoot,
      `img/expansion/shenhua/portrait/small/${name}.jpg`
    );
    await mkdir(path.dirname(big), { recursive: true });
    await mkdir(path.dirname(small), { recursive: true });
    cropPortrait(source, big, 144, 141);
    cropPortrait(source, small, 62, 137);
    process.stdout.write(`derived portraits for ${name}\n`);
  }
}

try {
  for (const asset of assets) await download(asset);
  if (!skipPortraits) await createPortraits();
} catch (error) {
  for (const asset of assets) {
    await rm(path.join(outputRoot, `${asset.output}.download`), {
      force: true
    });
  }
  throw error;
}
