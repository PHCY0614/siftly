"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const popupSource = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const helperStart = popupSource.indexOf("const PopupPresentation =");
const helperEnd = popupSource.indexOf("function renderActiveDatabase()", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "popup presentation helper must be loadable");

const context = vm.createContext({});
vm.runInContext(popupSource.slice(helperStart, helperEnd), context, {
  filename: "popup.js#presentation"
});
const presentation = vm.runInContext("PopupPresentation", context);

function testGuidanceSurfaceRules() {
  const other = presentation.nextStep({ currentSurface: "other", state: {} });
  assert.equal(other.hidden, false);
  assert.match(other.message, /切換到 Notion/);
  assert.equal(other.action, false);

  const otherWhileBatchRuns = presentation.nextStep({
    currentSurface: "other",
    state: { mode: "batch", paused: false, running: true, queueCount: 2 }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(otherWhileBatchRuns)), { hidden: true, message: "", action: false });

  const noPending = presentation.nextStep({
    currentSurface: "database",
    state: { mode: "idle", paused: true, queueCount: 0, databaseCheck: { code: "NO_PENDING_PAGES" } }
  });
  assert.equal(noPending.hidden, false);
  assert.equal(noPending.action, true);
  assert.match(noPending.message, /準備待分析文章/);

  const oldNoPendingOnSingle = presentation.nextStep({
    currentSurface: "single",
    state: { paused: true, queueCount: 0, databaseCheck: { code: "NO_PENDING_PAGES" } }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(oldNoPendingOnSingle)), { hidden: true, message: "", action: false });

  const activeNoPending = presentation.nextStep({
    currentSurface: "database",
    state: { running: true, paused: false, queueCount: 0, databaseCheck: { code: "NO_PENDING_PAGES" } }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(activeNoPending)), { hidden: true, message: "", action: false });
}

function testDatabaseIdentityUsesExistingIds() {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.equal(
    presentation.activeDatabaseLabel({ config: { dataSourceId: id } }),
    "作用中資料庫：ID 12345678"
  );
  assert.equal(
    presentation.activeDatabaseLabel({ config: { notionTarget: `https://www.notion.so/${id.replaceAll("-", "")}` } }),
    "作用中資料庫：ID 12345678"
  );
  assert.equal(
    presentation.activeDatabaseLabel({ config: { databaseName: "不在 GET_CONFIG 的契約中" } }),
    ""
  );
  assert.equal(
    presentation.activeDatabaseLabel({ currentPageInfo: { sourceDataSourceId: id } }),
    "作用中資料庫：ID 12345678"
  );
}

function testImportantAnnouncementsAreDeduplicated() {
  let previousBucket = "";
  let lastKey = "";
  const spoken = [];
  const snapshots = [
    { running: true, paused: false, current: { id: "page-1", title: "第一篇" }, stage: { startedAt: "2026-10-10T00:00:00Z" } },
    { running: true, paused: false, current: { id: "page-1", title: "第一篇" }, stage: { startedAt: "2026-10-10T00:00:01Z" } },
    { running: false, paused: true, queueCount: 0 }
  ];
  for (const state of snapshots) {
    const result = presentation.statusAnnouncement({
      state,
      previousBucket,
      initial: !lastKey
    });
    if (result.key !== lastKey && result.message) spoken.push(result.message);
    lastKey = result.key;
    previousBucket = result.bucket;
  }
  assert.deepEqual(spoken, ["分析開始：第一篇。", "分析已結束，目前待命。"]);

  const failure = presentation.statusAnnouncement({
    state: { lastError: "AI 服務失敗", databaseCheck: { message: "" } },
    previousBucket: "running"
  });
  assert.equal(failure.bucket, "error");
  assert.equal(failure.message, "");
}

testGuidanceSurfaceRules();
testDatabaseIdentityUsesExistingIds();
testImportantAnnouncementsAreDeduplicated();
console.log("popup UI guidance tests passed");
