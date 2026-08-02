#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const CORPUS_DIR = resolve(ROOT, "corpus");
const RAW_DIR = resolve(ROOT, "raw");
const OUTPUT_DIR = resolve(ROOT, "knowledge");

const ROMANCE_EPUB = resolve(RAW_DIR, "sanguoyanyi-wikisource-zh.epub");
const HISTORY_EPUB = resolve(RAW_DIR, "sanguozhi-wikisource-zh.epub");
const MOE_ARCHIVE = resolve(RAW_DIR, "dict_idioms_2020_20260625.zip");

const APPEARANCE_CUE = /(身長|長[一二三四五六七八九十百]+尺|面如|面若|面似|廣額|闊面|豹頭|環眼|燕頷|虎鬚|長髯|細眼|丹鳳眼|臥蠶眉|碧眼|紫髯|美姿顏|玉肌花貌|傾國之色|色伎俱佳|國色|絕色|美貌|姿色|花容|月貌|容貌|姿貌|形貌|相貌|器宇軒昂|威風凜凜|骨格|聲若巨雷|虎體|熊腰|猿臂|腰大十圍|兩耳垂肩|雙手過膝|目能自顧其耳|目射神光|圓面大耳|方口厚脣|黑瘤|胖大)/;

const ERA_STARTS = new Map([
  ["建寧", [168]], ["熹平", [172]], ["光和", [178]], ["中平", [184]],
  ["初平", [190]], ["興平", [194]], ["建安", [196]], ["延康", [220]],
  ["黃初", [220]], ["太和", [227]], ["青龍", [233]], ["景初", [237]],
  ["正始", [240]], ["嘉平", [249]], ["正元", [254]], ["甘露", [256]],
  ["景元", [260]], ["咸熙", [264]], ["章武", [221]], ["建興", [223, 252]],
  ["延熙", [238]], ["景耀", [258]], ["炎興", [263]], ["黃武", [222]],
  ["黃龍", [229]], ["嘉禾", [232]], ["赤烏", [238]], ["太元", [251]],
  ["神鳳", [252]], ["五鳳", [254]], ["太平", [256]], ["永安", [258]],
  ["寶鼎", [266]], ["建衡", [269]], ["鳳凰", [272]], ["天冊", [275]],
  ["天璽", [276]], ["天紀", [277]], ["泰始", [265]], ["咸寧", [275]],
  ["太康", [280]]
]);

function decodeEntities(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1].toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
}

function cleanHtml(value) {
  return decodeEntities(
    value
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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJsonl(path) {
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJsonl(name, records) {
  const path = resolve(OUTPUT_DIR, name);
  const content = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  await writeFile(path, content);
  return {
    path: `knowledge/${name}`,
    records: records.length,
    bytes: Buffer.byteLength(content),
    sha256: sha256(Buffer.from(content))
  };
}

function zipEntry(epubPath, entry) {
  return execFileSync("unzip", ["-p", epubPath, entry], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

function listZip(epubPath) {
  return execFileSync("unzip", ["-Z1", epubPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  }).split("\n").filter(Boolean);
}

function excerptAround(text, term, radius = 110) {
  const index = text.indexOf(term);
  if (index < 0) return null;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + term.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

function parseChineseNumber(value) {
  if (value === "元") return 1;
  const digits = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0;
  let current = 0;
  for (const character of value) {
    if (character === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (character in digits) {
      current = digits[character];
    }
  }
  return total + current;
}

function mentionPeople(text, people) {
  return people
    .filter((person) => [person.traditional, ...person.aliases].some((alias) => alias.length >= 2 && text.includes(alias)))
    .map((person) => person.name);
}

function mentionPlaces(text, places) {
  return places.filter((place) => text.includes(place));
}

function extractEraMentions(record) {
  const eraNames = [...ERA_STARTS.keys()].join("|");
  const pattern = new RegExp(`(${eraNames})(元|[一二三四五六七八九十百兩]+)年`, "g");
  const mentions = [];
  for (const match of record.text.matchAll(pattern)) {
    const reignYear = parseChineseNumber(match[2]);
    mentions.push({
      schema: "sgs.timeline-mention.v1",
      era: match[1],
      reignYear,
      normalizedYearCandidates: ERA_STARTS.get(match[1]).map((start) => start + reignYear - 1),
      ambiguous: ERA_STARTS.get(match[1]).length > 1,
      source: {
        work: record.work,
        chapter: record.chapter,
        chapterLabel: record.chapterLabel,
        title: record.title,
        sourcePage: record.sourcePage
      },
      excerpt: excerptAround(record.text, match[0], 90)
    });
  }
  return mentions;
}

function extractRomanceStories(indexRecord, chapterByNumber, people, places) {
  const records = [];
  const linePattern = /^(第[一二三四五六七八九十百兩]+回)[\s　]+(.+)$/;
  for (const line of indexRecord.text.split("\n")) {
    const match = line.match(linePattern);
    if (!match) continue;
    const chapterNumber = parseChineseNumber(match[1].slice(1, -1));
    const chapter = chapterByNumber.get(chapterNumber);
    if (!chapter) continue;
    const titles = match[2].trim().split(/[　]{2,}|\s{2,}/).filter(Boolean);
    titles.forEach((title, storyIndex) => {
      records.push({
        schema: "sgs.story-index.v1",
        id: `sanguoyanyi-${String(chapterNumber).padStart(3, "0")}-${storyIndex + 1}`,
        work: "sanguoyanyi",
        chapter: chapterNumber,
        chapterLabel: chapter.chapterLabel,
        storyIndex: storyIndex + 1,
        title,
        people: mentionPeople(title, people),
        places: mentionPlaces(title, places),
        sourcePage: chapter.sourcePage
      });
    });
  }
  return records;
}

function extractHistorySections(historyRecords) {
  const recordByChapter = new Map(historyRecords.map((record) => [record.chapter, record]));
  const entries = listZip(HISTORY_EPUB)
    .filter((entry) => /^OPS\/c\d+_san_guo_zhi_juan\d+\.xhtml$/.test(entry));
  const sections = [];
  for (const entry of entries) {
    const chapter = Number(entry.match(/_juan(\d+)\.xhtml$/)?.[1]);
    const record = recordByChapter.get(chapter);
    if (!record) continue;
    const xhtml = zipEntry(HISTORY_EPUB, entry);
    const headings = [...xhtml.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)];
    headings.forEach((heading, index) => {
      const id = heading[1].match(/\bid="([^"]+)"/)?.[1] ?? null;
      const title = cleanHtml(heading[2]);
      if (!title || /^(評|附錄|序|表)$/.test(title)) return;
      const start = heading.index + heading[0].length;
      const end = headings[index + 1]?.index ?? xhtml.length;
      const rawBody = xhtml.slice(start, end);
      const noteBlocks = [...rawBody.matchAll(/<small\b[^>]*>([\s\S]*?)<\/small>/gi)].map((match) => cleanHtml(match[1]));
      const mainBody = cleanHtml(rawBody.replace(/<small\b[^>]*>[\s\S]*?<\/small>/gi, ""));
      sections.push({
        schema: "sgs.biography-section.v1",
        id: `sanguozhi-${String(chapter).padStart(2, "0")}-${id ?? index + 1}`,
        title,
        chapter,
        chapterLabel: record.chapterLabel,
        sourcePage: `${record.sourcePage}${id ? `#${id}` : ""}`,
        epubEntry: entry,
        mainText: mainBody,
        peiNoteTexts: noteBlocks.filter(Boolean)
      });
    });
  }
  return sections;
}

function splitSentences(text) {
  return text
    .replace(/\n+/g, "\n")
    .split(/(?<=[。！？；])|\n/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function appearanceFromText({ text, source, layer, fixedSubject, people }) {
  const sentences = splitSentences(text);
  const results = [];
  sentences.forEach((sentence, index) => {
    if (!APPEARANCE_CUE.test(sentence)) return;
    if (index > 0 && APPEARANCE_CUE.test(sentences[index - 1])) return;
    const passage = sentences.slice(Math.max(0, index - 1), Math.min(sentences.length, index + 6)).join("");
    const cueIndex = passage.search(APPEARANCE_CUE);
    const directNames = [...passage.matchAll(/姓([^，。；]{1,2})，名([^，。；]{1,2})/g)].map((match) => ({
      name: `${match[1]}${match[2]}`,
      index: match.index
    }));
    const directName = directNames
      .sort((left, right) => {
        const leftAfter = left.index >= cueIndex ? 0 : 1;
        const rightAfter = right.index >= cueIndex ? 0 : 1;
        return leftAfter - rightAfter || Math.abs(left.index - cueIndex) - Math.abs(right.index - cueIndex);
      })[0]?.name ?? null;
    const mentioned = mentionPeople(passage, people);
    const subjects = [];
    const sentenceCueIndex = sentence.search(APPEARANCE_CUE);
    const fixedShortName = fixedSubject?.at(-1) ?? null;
    const fixedShortIndex = fixedShortName ? sentence.indexOf(fixedShortName) : -1;
    const sectionContextSubject = fixedSubject && fixedShortIndex >= 0 && Math.abs(fixedShortIndex - sentenceCueIndex) <= 12
      ? fixedSubject
      : null;
    if (sectionContextSubject) subjects.push(sectionContextSubject);
    if (!sectionContextSubject) {
      subjects.push(...people
        .filter((person) => person.traditional === directName || person.name === directName)
        .map((person) => person.name));
      if (subjects.length === 0 && directName) subjects.push(directName);
    }

    let identitySubject = null;
    if (!sectionContextSubject && !directName) {
      const identityMatches = people.flatMap((person) => [person.traditional, ...person.aliases]
        .filter((alias) => alias.length >= 2)
        .flatMap((alias) => {
          const patterns = [
            new RegExp(`${escapeRegExp(alias)}(?:也|矣)`),
            new RegExp(`乃(?:是|為)?[^。；]{0,12}${escapeRegExp(alias)}`),
            new RegExp(`即[^。；]{0,16}${escapeRegExp(alias)}`),
            new RegExp(`${escapeRegExp(alias)}在此`)
          ];
          return patterns.flatMap((pattern) => {
            const match = passage.match(pattern);
            return match ? [{ person: person.name, distance: Math.abs(match.index - cueIndex) }] : [];
          });
        }))
        .sort((left, right) => left.distance - right.distance);
      if (identityMatches[0]) {
        identitySubject = identityMatches[0].person;
        subjects.push(identitySubject);
      }
    }

    let proximitySubject = null;
    if (!sectionContextSubject && !directName && !identitySubject) {
      const ranked = people.flatMap((person) => [person.traditional, ...person.aliases]
        .filter((alias) => alias.length >= 2)
        .flatMap((alias) => {
          const positions = [];
          let position = passage.indexOf(alias);
          while (position >= 0) {
            positions.push({ person: person.name, distance: Math.abs(position - cueIndex) });
            position = passage.indexOf(alias, position + alias.length);
          }
          return positions;
        }))
        .sort((left, right) => left.distance - right.distance);
      if (ranked[0] && ranked[0].distance <= 90) {
        proximitySubject = ranked[0].person;
        subjects.push(proximitySubject);
      }
    }

    let confidence = directName || identitySubject || sectionContextSubject ? "high" : "candidate";
    // Proximity is useful for discovery but not proof of grammatical subject.
    // Keeping it as a candidate avoids assigning an observer's description to
    // the observer (or confusing Sima Yi with Sima Shi, Zhang Jiao with the
    // immortal he met, and similar narrative constructions).
    if (subjects.length === 0 && fixedSubject && index <= 3) {
      subjects.push(fixedSubject);
      confidence = "section-context";
    }
    if (subjects.length === 0 && !fixedSubject) return;
    results.push({
      schema: "sgs.appearance-passage.v1",
      subjects,
      sectionSubjectHint: fixedSubject ?? null,
      mentionedPeople: mentioned,
      evidenceLayer: layer,
      confidence,
      source,
      passage: passage.length > 900 ? `${passage.slice(0, 900)}…` : passage
    });
  });
  return results;
}

function extractAppearancePassages(romanceRecords, historySections, people) {
  const results = [];
  for (const record of romanceRecords) {
    results.push(...appearanceFromText({
      text: record.text,
      source: {
        work: record.work,
        chapter: record.chapter,
        chapterLabel: record.chapterLabel,
        sourcePage: record.sourcePage
      },
      layer: "romance",
      fixedSubject: null,
      people
    }));
  }
  for (const section of historySections) {
    const source = {
      work: "sanguozhi",
      chapter: section.chapter,
      chapterLabel: section.chapterLabel,
      section: section.title,
      sourcePage: section.sourcePage
    };
    results.push(...appearanceFromText({
      text: section.mainText,
      source,
      layer: "history-main",
      fixedSubject: section.title,
      people
    }));
    for (const note of section.peiNoteTexts) {
      results.push(...appearanceFromText({
        text: note,
        source,
        layer: "pei-note",
        fixedSubject: section.title,
        people
      }));
    }
  }
  const seen = new Set();
  return results.filter((record) => {
    const key = `${record.source.sourcePage}\u0000${record.evidenceLayer}\u0000${record.passage}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function curatedVisualPassages(entries, recordsByKey) {
  return entries.map((entry, index) => {
    const record = recordsByKey.get(entry.ref);
    if (!record) throw new Error(`curated visual passage has missing source: ${entry.ref}`);
    const passage = excerptAround(record.text, entry.query, 135);
    if (!passage) throw new Error(`curated visual passage query not found: ${entry.ref} / ${entry.query}`);
    return {
      schema: "sgs.curated-visual-passage.v1",
      id: `visual-${String(index + 1).padStart(3, "0")}`,
      ...entry,
      source: {
        work: record.work,
        chapter: record.chapter,
        chapterLabel: record.chapterLabel,
        title: record.title,
        sourcePage: record.sourcePage
      },
      passage,
      reviewStatus: "curated"
    };
  });
}

function extractCitedWorks(records) {
  const works = new Map();
  for (const record of records) {
    for (const match of record.text.matchAll(/《([^》\n]{1,40})》/g)) {
      const title = match[1].trim();
      if (!title || /[，。；：「」]/.test(title)) continue;
      const current = works.get(title) ?? { title, mentions: 0, sources: [] };
      current.mentions += 1;
      if (current.sources.length < 8 && !current.sources.some((source) => source.sourcePage === record.sourcePage)) {
        current.sources.push({
          work: record.work,
          chapterLabel: record.chapterLabel,
          sourcePage: record.sourcePage,
          excerpt: excerptAround(record.text, match[0], 80)
        });
      }
      works.set(title, current);
    }
  }
  return [...works.values()]
    .sort((left, right) => right.mentions - left.mentions || left.title.localeCompare(right.title, "zh-Hant"))
    .map((work) => ({
      schema: "sgs.cited-work.v1",
      ...work,
      lookupUrl: `https://zh.wikisource.org/w/index.php?search=${encodeURIComponent(work.title)}`,
      reviewStatus: "title-extracted"
    }));
}

function parseMoeWorkbook(xlsxPath) {
  const sharedXml = zipEntry(xlsxPath, "xl/sharedStrings.xml");
  const strings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeEntities([...match[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join(""))
      .replace(/_x000D_/g, "\n")
  );
  const sheetXml = zipEntry(xlsxPath, "xl/worksheets/sheet1.xml");
  const rows = [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = {};
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>\s*<v>([\s\S]*?)<\/v>\s*<\/c>/g)) {
      const column = cell[1].match(/\br="([A-Z]+)/)?.[1];
      if (!column) continue;
      cells[column] = cell[1].includes('t="s"') ? strings[Number(cell[2])] : cell[2];
    }
    return cells;
  });
  return rows.slice(1).map((row) => ({
    recordNumber: row.A,
    idiom: row.B,
    primarySourceName: row.F,
    classification: row.V
  })).filter((row) => row.idiom);
}

function normalizeForMatch(text) {
  const normalized = [];
  const sourceIndexes = [];
  let sourceIndex = 0;
  for (const character of text) {
    if (/\p{Script=Han}/u.test(character)) {
      normalized.push(character);
      sourceIndexes.push(sourceIndex);
    }
    sourceIndex += character.length;
  }
  return { text: normalized.join(""), sourceIndexes };
}

function buildTrie(entries) {
  const root = new Map();
  for (const entry of entries) {
    let node = root;
    for (const character of entry.normalized) {
      if (!node.has(character)) node.set(character, new Map());
      node = node.get(character);
    }
    const terminal = node.get("$") ?? [];
    terminal.push(entry);
    node.set("$", terminal);
  }
  return root;
}

function matchMoeIdioms(moeRows, records) {
  const eligible = moeRows
    .map((row) => ({ ...row, normalized: normalizeForMatch(row.idiom).text }))
    .filter((row) => row.normalized.length >= 4 && row.normalized.length <= 12);
  const trie = buildTrie(eligible);
  const matches = new Map();
  for (const record of records) {
    const normalized = normalizeForMatch(record.text);
    for (let start = 0; start < normalized.text.length; start += 1) {
      let node = trie;
      for (let cursor = start; cursor < Math.min(normalized.text.length, start + 12); cursor += 1) {
        node = node.get(normalized.text[cursor]);
        if (!node) break;
        const terminals = node.get("$");
        if (!terminals) continue;
        for (const idiom of terminals) {
          const key = idiom.recordNumber;
          const current = matches.get(key) ?? { idiom, occurrences: 0, sources: [] };
          current.occurrences += 1;
          if (current.sources.length < 12 && !current.sources.some((source) => source.sourcePage === record.sourcePage)) {
            const originalIndex = normalized.sourceIndexes[start];
            const endIndex = normalized.sourceIndexes[cursor] + 1;
            const left = Math.max(0, originalIndex - 90);
            const right = Math.min(record.text.length, endIndex + 90);
            current.sources.push({
              work: record.work,
              chapter: record.chapter,
              chapterLabel: record.chapterLabel,
              sourcePage: record.sourcePage,
              excerpt: `${left > 0 ? "…" : ""}${record.text.slice(left, right).replace(/\s+/g, " ").trim()}${right < record.text.length ? "…" : ""}`
            });
          }
          matches.set(key, current);
        }
      }
    }
  }
  return [...matches.values()]
    .sort((left, right) => right.occurrences - left.occurrences || left.idiom.idiom.localeCompare(right.idiom.idiom, "zh-Hant"))
    .map(({ idiom, occurrences, sources }) => ({
      schema: "sgs.moe-idiom-match.v1",
      idiom: idiom.idiom,
      moeRecordNumber: idiom.recordNumber,
      moeClassification: idiom.classification,
      moePrimarySourceName: idiom.primarySourceName,
      occurrences,
      sources,
      sourceArchive: "raw/dict_idioms_2020_20260625.zip",
      reviewStatus: "exact-character-match"
    }));
}

function resolveReference(ref, recordsByKey, queries) {
  const record = recordsByKey.get(ref);
  if (!record) return { ref, missing: true };
  const matchedTerm = queries.find((query) => record.text.includes(query));
  return {
    ref,
    work: record.work,
    chapter: record.chapter,
    chapterLabel: record.chapterLabel,
    title: record.title,
    sourcePage: record.sourcePage,
    excerpt: matchedTerm ? excerptAround(record.text, matchedTerm, 100) : null
  };
}

function curatedTimeline(entries, recordsByKey) {
  return entries.map((entry, index) => ({
    schema: "sgs.curated-timeline-event.v1",
    id: `event-${entry.year}-${String(index + 1).padStart(2, "0")}`,
    year: entry.year,
    era: entry.era,
    event: entry.event,
    queries: entry.queries,
    sources: entry.refs.map((ref) => resolveReference(ref, recordsByKey, entry.queries)),
    reviewStatus: "curated"
  }));
}

function curatedExpressions(entries, chapterRecords) {
  return entries.map((entry) => {
    const sources = [];
    for (const record of chapterRecords) {
      const matchedTerm = entry.searchTerms.find((term) => record.text.includes(term));
      if (!matchedTerm) continue;
      sources.push({
        work: record.work,
        chapter: record.chapter,
        chapterLabel: record.chapterLabel,
        title: record.title,
        sourcePage: record.sourcePage,
        matchedTerm,
        excerpt: excerptAround(record.text, matchedTerm, 105)
      });
    }
    return {
      schema: "sgs.curated-expression.v1",
      ...entry,
      corpusSources: sources,
      reviewStatus: entry.originStatus.includes("unresolved") ? "origin-unresolved" : "curated"
    };
  });
}

function gamePeopleRecords(people, chapterRecords, appearances, curatedVisuals) {
  return people.map((person) => {
    const aliases = [person.traditional, ...person.aliases];
    const workMentions = {};
    for (const work of ["sanguoyanyi", "sanguozhi"]) {
      const sources = [];
      let occurrences = 0;
      for (const record of chapterRecords.filter((candidate) => candidate.work === work)) {
        const matchedAliases = aliases.filter((alias) => alias.length >= 2 && record.text.includes(alias));
        if (!matchedAliases.length) continue;
        occurrences += matchedAliases.reduce((sum, alias) => sum + record.text.split(alias).length - 1, 0);
        sources.push({ chapter: record.chapter, chapterLabel: record.chapterLabel, sourcePage: record.sourcePage });
      }
      workMentions[work] = { occurrences, units: sources.length, sources };
    }
    const appearanceSources = appearances.filter((appearance) =>
      appearance.confidence === "high" &&
      (appearance.subjects.includes(person.name) || appearance.subjects.includes(person.traditional))
    );
    const curatedVisualSources = curatedVisuals.filter((visual) => visual.subject === person.name);
    return {
      schema: "sgs.game-person.v1",
      ...person,
      aliases: [...new Set(aliases)],
      mentions: workMentions,
      appearancePassages: appearanceSources.length,
      appearanceEvidenceLayers: [...new Set(appearanceSources.map((appearance) => appearance.evidenceLayer))],
      curatedVisualPassages: curatedVisualSources.length,
      curatedVisualKinds: [...new Set(curatedVisualSources.map((visual) => visual.kind))],
      curatedVisualEvidenceLayers: [...new Set(curatedVisualSources.map((visual) => visual.evidenceLayer))]
    };
  });
}

function placeRecords(places, chapterRecords) {
  return places.map((place) => {
    const sources = chapterRecords
      .filter((record) => record.text.includes(place))
      .map((record) => ({
        work: record.work,
        chapter: record.chapter,
        chapterLabel: record.chapterLabel,
        sourcePage: record.sourcePage,
        excerpt: excerptAround(record.text, place, 65)
      }));
    return {
      schema: "sgs.place-index.v1",
      name: place,
      sourceUnits: sources.length,
      sources
    };
  }).sort((left, right) => right.sourceUnits - left.sourceUnits || left.name.localeCompare(right.name, "zh-Hant"));
}

function unitRecords(chapterRecords, timelineMentions, people, places, appearances, citedWorks, stories) {
  return chapterRecords.map((record) => ({
    schema: "sgs.source-unit-index.v1",
    work: record.work,
    chapter: record.chapter,
    chapterLabel: record.chapterLabel,
    title: record.title,
    sourcePage: record.sourcePage,
    people: mentionPeople(record.text, people),
    places: mentionPlaces(record.text, places),
    timelineMentions: timelineMentions.filter((mention) => mention.source.sourcePage === record.sourcePage).length,
    stories: stories.filter((story) => story.sourcePage === record.sourcePage).map((story) => story.title),
    appearancePassages: appearances.filter((appearance) => appearance.source.sourcePage === record.sourcePage).length,
    citedWorks: citedWorks.filter((work) => work.sources.some((source) => source.sourcePage === record.sourcePage)).map((work) => work.title)
  }));
}

async function extractMoeXlsx() {
  const temporary = await mkdtemp(resolve(tmpdir(), "sgs-moe-idioms-"));
  try {
    execFileSync("unzip", ["-q", MOE_ARCHIVE, "-d", temporary]);
    const names = listZip(MOE_ARCHIVE);
    const xlsxName = names.find((name) => name.endsWith(".xlsx"));
    if (!xlsxName) throw new Error("MOE archive contains no XLSX workbook");
    return parseMoeWorkbook(resolve(temporary, xlsxName));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
const curation = JSON.parse(await readFile(resolve(ROOT, "curation.json"), "utf8"));
const romanceAll = await readJsonl(resolve(CORPUS_DIR, "sanguoyanyi.jsonl"));
const historyAll = await readJsonl(resolve(CORPUS_DIR, "sanguozhi.jsonl"));
const romanceChapters = romanceAll.filter((record) => record.kind === "chapter");
const historyChapters = historyAll.filter((record) => record.kind === "chapter");
const chapterRecords = [...romanceChapters, ...historyChapters];
const recordsByKey = new Map(chapterRecords.map((record) => [`${record.work}:${record.chapter}`, record]));

const stories = extractRomanceStories(
  romanceAll.find((record) => record.kind === "work-index"),
  new Map(romanceChapters.map((record) => [record.chapter, record])),
  curation.people,
  curation.places
);
const historySections = extractHistorySections(historyChapters);
const appearances = extractAppearancePassages(romanceChapters, historySections, curation.people);
const curatedVisuals = curatedVisualPassages(curation.visualPassages, recordsByKey);
const timelineMentions = chapterRecords.flatMap(extractEraMentions);
const citedWorks = extractCitedWorks(chapterRecords);
const moeRows = await extractMoeXlsx();
const moeMatches = matchMoeIdioms(moeRows, chapterRecords);
const expressions = curatedExpressions(curation.expressions, chapterRecords);
const timeline = curatedTimeline(curation.timeline, recordsByKey);
const people = gamePeopleRecords(curation.people, chapterRecords, appearances, curatedVisuals);
const places = placeRecords(curation.places, chapterRecords);
const units = unitRecords(chapterRecords, timelineMentions, curation.people, curation.places, appearances, citedWorks, stories);

const outputs = [];
outputs.push(await writeJsonl("units.jsonl", units));
outputs.push(await writeJsonl("stories.jsonl", stories));
outputs.push(await writeJsonl("biography-sections.jsonl", historySections));
outputs.push(await writeJsonl("people-game.jsonl", people));
outputs.push(await writeJsonl("places.jsonl", places));
outputs.push(await writeJsonl("timeline-mentions.jsonl", timelineMentions));
outputs.push(await writeJsonl("timeline-curated.jsonl", timeline));
outputs.push(await writeJsonl("appearance-passages.jsonl", appearances));
outputs.push(await writeJsonl("visual-passages-curated.jsonl", curatedVisuals));
outputs.push(await writeJsonl("cited-works.jsonl", citedWorks));
outputs.push(await writeJsonl("idiom-matches-moe.jsonl", moeMatches));
outputs.push(await writeJsonl("expressions-curated.jsonl", expressions));

const upstreamFiles = [
  resolve(CORPUS_DIR, "sanguoyanyi.jsonl"),
  resolve(CORPUS_DIR, "sanguozhi.jsonl"),
  ROMANCE_EPUB,
  HISTORY_EPUB,
  MOE_ARCHIVE,
  resolve(ROOT, "curation.json")
];
const upstream = [];
for (const path of upstreamFiles) {
  const content = await readFile(path);
  upstream.push({
    path: path.slice(ROOT.length + 1),
    bytes: (await stat(path)).size,
    sha256: sha256(content)
  });
}

const manifest = {
  schema: "sgs.source-knowledge-manifest.v1",
  generatedAt: new Date().toISOString(),
  method: {
    deterministic: ["chapter and volume indexing", "exact alias matching", "reign-title matching", "appearance cue extraction", "MOE idiom trie matching"],
    curated: ["major timeline", "game person aliases", "major places", "Three Kingdoms expressions and source classification"],
    caveat: "自动识别结果是检索索引，不等于学术定论；用于成品前须阅读所引原文，并复核时代、地名和裴注层次。"
  },
  counts: {
    units: units.length,
    stories: stories.length,
    biographySections: historySections.length,
    gamePeople: people.length,
    places: places.length,
    timelineMentions: timelineMentions.length,
    curatedTimelineEvents: timeline.length,
    appearancePassages: appearances.length,
    curatedVisualPassages: curatedVisuals.length,
    citedWorks: citedWorks.length,
    moeDictionaryRows: moeRows.length,
    matchedMoeIdioms: moeMatches.length,
    curatedExpressions: expressions.length
  },
  upstream,
  outputs
};
await writeFile(resolve(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify(manifest.counts, null, 2));
