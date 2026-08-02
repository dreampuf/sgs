#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const RAW_DIR = resolve(ROOT, "raw");
const CORPUS_DIR = resolve(ROOT, "corpus");
const REUSE = process.argv.includes("--reuse");

const works = [
  {
    id: "sanguoyanyi",
    title: "三國演義",
    author: "羅貫中",
    edition: "毛宗崗評改一百二十回本",
    evidenceClass: "literary-narrative",
    sourcePage: "https://zh.wikisource.org/zh-hant/三國演義",
    exportUrl:
      "https://ws-export.wmcloud.org/?format=epub&lang=zh&page=%E4%B8%89%E5%9C%8B%E6%BC%94%E7%BE%A9",
    rawFile: "sanguoyanyi-wikisource-zh.epub",
    corpusFile: "sanguoyanyi.jsonl",
    chapterPattern: /_di(\d+)hui\.xhtml$/,
    chapterLabel: (number) => `第${String(number).padStart(3, "0")}回`,
    chapterUrl: (number) =>
      `https://zh.wikisource.org/zh-hant/三國演義/第${String(number).padStart(3, "0")}回`,
  },
  {
    id: "sanguozhi",
    title: "三國志",
    author: "陳壽撰，裴松之注",
    edition: "維基文庫六十五卷本（含裴松之注與附錄）",
    evidenceClass: "historical-record",
    sourcePage: "https://zh.wikisource.org/zh-hant/三國志",
    exportUrl:
      "https://ws-export.wmcloud.org/?format=epub&lang=zh&page=%E4%B8%89%E5%9C%8B%E5%BF%97",
    rawFile: "sanguozhi-wikisource-zh.epub",
    corpusFile: "sanguozhi.jsonl",
    logicalChapterOrder: true,
    chapterPattern: /_juan(\d+)\.xhtml$/,
    chapterLabel: (number) => `卷${String(number).padStart(2, "0")}`,
    chapterUrl: (number) =>
      `https://zh.wikisource.org/zh-hant/三國志/卷${String(number).padStart(2, "0")}`,
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1].toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
}

function extractTitle(xhtml) {
  const match = xhtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : "";
}

function cleanText(xhtml) {
  return decodeEntities(
    xhtml
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<table\b[^>]*class="[^"]*ws-header[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
      .replace(/<div\b[^>]*class="[^"]*noprint[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<(?:br|hr)\b[^>]*\/?\s*>/gi, "\n")
      .replace(/<\/(?:address|blockquote|dd|div|dl|dt|h[1-6]|li|ol|p|pre|section|table|tbody|td|th|tr|ul)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[\t \u00a0]+\n/g, "\n")
    .replace(/\n[\t \u00a0]+/g, "\n")
    .replace(/[\t \u00a0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function listContentEntries(epubPath) {
  const output = execFileSync("unzip", ["-Z1", epubPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  return output
    .split("\n")
    .filter((entry) => /^OPS\/c\d+_.+\.xhtml$/.test(entry))
    .sort((left, right) => {
      const leftIndex = Number(left.match(/^OPS\/c(\d+)_/)?.[1] ?? 0);
      const rightIndex = Number(right.match(/^OPS\/c(\d+)_/)?.[1] ?? 0);
      return leftIndex - rightIndex;
    });
}

function readZipEntry(epubPath, entry) {
  return execFileSync("unzip", ["-p", epubPath, entry], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { "user-agent": "sgs-source-corpus/1.0 (local research corpus)" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 2).toString("ascii") !== "PK") {
    throw new Error(`download is not an EPUB/ZIP: ${url}`);
  }
  await writeFile(destination, buffer);
}

async function prepareWork(work) {
  const epubPath = resolve(RAW_DIR, work.rawFile);
  if (!REUSE) await download(work.exportUrl, epubPath);

  const epub = await readFile(epubPath);
  if (epub.subarray(0, 2).toString("ascii") !== "PK") {
    throw new Error(`${work.rawFile} does not have a ZIP signature`);
  }
  execFileSync("unzip", ["-t", epubPath], { stdio: "ignore" });

  const entries = listContentEntries(epubPath);
  if (work.logicalChapterOrder) {
    entries.sort((left, right) => {
      const leftChapter = Number(left.match(work.chapterPattern)?.[1] ?? 0);
      const rightChapter = Number(right.match(work.chapterPattern)?.[1] ?? 0);
      const leftIndex = Number(left.match(/^OPS\/c(\d+)_/)?.[1] ?? 0);
      const rightIndex = Number(right.match(/^OPS\/c(\d+)_/)?.[1] ?? 0);
      const leftGroup = leftIndex === 0 ? 0 : leftChapter ? 1 : 2;
      const rightGroup = rightIndex === 0 ? 0 : rightChapter ? 1 : 2;
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;
      if (leftChapter && rightChapter) return leftChapter - rightChapter;
      return leftIndex - rightIndex;
    });
  }

  const records = entries.map((entry, sequence) => {
    const xhtml = readZipEntry(epubPath, entry);
    const chapter = Number(entry.match(work.chapterPattern)?.[1] ?? 0) || null;
    const kind = chapter ? "chapter" : sequence === 0 ? "work-index" : "appendix";
    const sourcePage = chapter ? work.chapterUrl(chapter) : work.sourcePage;

    return {
      schema: "sgs.source-text.v1",
      work: work.id,
      workTitle: work.title,
      evidenceClass: work.evidenceClass,
      sequence,
      kind,
      chapter,
      chapterLabel: chapter ? work.chapterLabel(chapter) : null,
      title: extractTitle(xhtml),
      sourcePage,
      epubEntry: entry,
      text: cleanText(xhtml),
    };
  });

  const corpusPath = resolve(CORPUS_DIR, work.corpusFile);
  await writeFile(corpusPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const corpus = await readFile(corpusPath);
  const chapterCount = records.filter((record) => record.kind === "chapter").length;

  return {
    id: work.id,
    title: work.title,
    author: work.author,
    edition: work.edition,
    evidenceClass: work.evidenceClass,
    sourcePage: work.sourcePage,
    exportUrl: work.exportUrl,
    raw: {
      path: `raw/${work.rawFile}`,
      bytes: (await stat(epubPath)).size,
      sha256: sha256(epub),
    },
    corpus: {
      path: `corpus/${work.corpusFile}`,
      records: records.length,
      chapters: chapterCount,
      bytes: corpus.length,
      sha256: sha256(corpus),
    },
  };
}

await mkdir(RAW_DIR, { recursive: true });
await mkdir(CORPUS_DIR, { recursive: true });

const preparedAt = new Date().toISOString();
const preparedWorks = [];
for (const work of works) preparedWorks.push(await prepareWork(work));

const manifest = {
  schema: "sgs.source-corpus-manifest.v1",
  preparedAt,
  language: "zh-Hant",
  sourceProvider: "Chinese Wikisource / Wikimedia WS Export",
  licenseNote:
    "古籍原作屬公版；維基文庫整理文字依來源頁所示的創用 CC 姓名標示-相同方式分享條款提供。使用或再散布前請保留來源與署名，並重新核對當時條款。",
  works: preparedWorks,
};
await writeFile(resolve(ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

for (const work of preparedWorks) {
  console.log(`${work.title}: ${work.corpus.records} records, ${work.corpus.chapters} chapters`);
  console.log(`  EPUB  ${work.raw.sha256}`);
  console.log(`  JSONL ${work.corpus.sha256}`);
}
