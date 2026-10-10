"use strict";

// Interface language: every string the pages and scripts show has an English entry with the same
// {placeholders}, and t() falls back to the Chinese source instead of showing nothing.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const I = require(path.join(root, "i18n/index.js"));
const english = require(path.join(root, "i18n/en.js"));
const N = require(path.join(root, "notion.js"));

const CJK = /[　-〿㐀-鿿＀-￯]/;
const PAGES = ["options.html", "popup.html"];
// Names of languages are shown in their own language.
const NOT_TRANSLATED = new Set(["正體中文"]);

function source(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

// Every script that shows interface text, so a new background module is covered without being listed.
function scripts() {
  return ["options.js", "popup.js", ...fs.readdirSync(path.join(root, "background")).map(name => `background/${name}`)];
}

function calledKeys() {
  const keys = new Set();
  for (const file of scripts()) {
    for (const match of source(file).matchAll(/(?<![\w$.])t\(\s*("(?:[^"\\\n]|\\.)*")/g)) keys.add(JSON.parse(match[1]));
  }
  // Reached through a variable rather than a literal.
  for (const name of Object.values(N.STATUS_NAMES)) keys.add(name);
  keys.add(JSON.parse(source("background/constants.js").match(/const NO_PENDING_PAGES_MESSAGE = ("(?:[^"\\]|\\.)*")/)[1]));
  return keys;
}

function pageTexts(page) {
  const html = source(page).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const texts = new Set();
  for (const match of html.matchAll(/>([^<]+)</g)) texts.add(match[1].replace(/\s+/g, " ").trim());
  for (const match of html.matchAll(/\s(?:placeholder|aria-label|title|alt)="([^"]*)"/g)) texts.add(match[1].replace(/\s+/g, " ").trim());
  return [...texts].filter(text => CJK.test(text));
}

function placeholders(text) {
  return (text.match(/\{\w+\}/g) || []).sort().join(",");
}

function testEveryStringHasEnglish() {
  const missing = [];
  for (const key of calledKeys()) {
    if (CJK.test(key) && !NOT_TRANSLATED.has(key) && english[key] === undefined) missing.push(key);
  }
  for (const page of PAGES) {
    for (const text of pageTexts(page)) {
      if (!NOT_TRANSLATED.has(text) && english[text] === undefined) missing.push(`${page}: ${text}`);
    }
  }
  assert.deepEqual(missing, [], "這些介面文字還沒有英文翻譯");
}

function testDictionaryIsConsistent() {
  const used = new Set([...calledKeys(), ...PAGES.flatMap(pageTexts)]);
  for (const [key, value] of Object.entries(english)) {
    assert.ok(used.has(key), `字典裡的「${key}」已經沒有地方使用`);
    assert.equal(placeholders(value), placeholders(key), `「${key}」的英文翻譯參數不一致`);
    assert.ok(value.trim() || !key.trim(), `「${key}」的英文翻譯是空的`);
  }
}

function testTranslateAndFallback() {
  I.setLanguage("zh");
  assert.equal(I.t("已選 {selectedCount} 篇", { selectedCount: 3 }), "已選 3 篇");
  I.setLanguage("en");
  assert.equal(I.t("已選 {selectedCount} 篇", { selectedCount: 3 }), "3 selected");
  assert.equal(I.t("這句沒有翻譯 {n}", { n: 1 }), "這句沒有翻譯 1", "缺翻譯時顯示中文原文");
  assert.equal(I.setLanguage("fr"), "zh", "不支援的語言回到中文");
  I.setLanguage("zh");
}

// Text that is prompt input or parsed as data must stay in the source language whatever the interface.
function testPromptAndDataTextIsNotTranslated() {
  for (const file of ["gemini.js", "prompt.js", "notion.js"]) {
    assert.doesNotMatch(source(file), /(?<![\w$.])t\(\s*"/, `${file} 不應翻譯：內容會送進 AI 或寫入 Notion`);
  }
  assert.match(source("background/analysis.js"), /errors = \[error\.message \|\| "輸出無法解析"\]/);
  assert.match(source("background/topic-organizer.js"), /`建議：\$\{compareDetail\}`/);
}

function testPagesLoadLanguageBeforeTheirScripts() {
  assert.match(source("options.html"), /<script src="i18n\/page\.js" data-scripts="ui-select\.js,options\.js"><\/script>/);
  assert.match(source("popup.html"), /<script src="i18n\/page\.js" data-scripts="shared\.js,ui-select\.js,popup\.js"><\/script>/);
  assert.match(source("options.html"), /<select id="ui-language" aria-label="介面語言" translate="no">/, "語言選單顯示各語言原名");
  assert.match(source("i18n/index.js"), /closest\('\[translate="no"\]'\)/);
  assert.match(source("background/state.js"), /merged\.uiLanguage = AnalyzerI18n\.setLanguage\(merged\.uiLanguage\)/);
}

testEveryStringHasEnglish();
testDictionaryIsConsistent();
testTranslateAndFallback();
testPromptAndDataTextIsNotTranslated();
testPagesLoadLanguageBeforeTheirScripts();
console.log("i18n tests passed");
