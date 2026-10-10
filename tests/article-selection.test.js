"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const CONFIG_KEY = "notionAiAnalyzerConfig";
const STATE_KEY = "notionAiAnalyzerState";
const TOKEN_KEY = "notionAiAnalyzerNotionToken";
const SOURCE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SOURCE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DATABASE_A = "11111111-1111-4111-8111-111111111111";
const PAGE_1 = "11111111-1111-4111-8111-111111111112";
const PAGE_2 = "11111111-1111-4111-8111-111111111113";
const PAGE_3 = "11111111-1111-4111-8111-111111111114";
const PAGE_4 = "11111111-1111-4111-8111-111111111115";
const PAGE_5 = "11111111-1111-4111-8111-111111111116";

const N = require(path.join(root, "notion.js"));
const F = N.bindColumns(N.defaultColumnMap());

function source(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function clone(value) {
  return structuredClone(value);
}

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get() { return null; } },
    async text() { return JSON.stringify(data); }
  };
}

function richText(value) {
  return value ? [{ type: "text", plain_text: value, text: { content: value } }] : [];
}

function page(id, options = {}) {
  const properties = {
    Name: { type: "title", title: richText(options.title || id) },
    [N.PROPERTY_NAMES.processingStatus]: {
      type: "select", select: options.status ? { name: options.status } : null
    },
    [N.PROPERTY_NAMES.aiTitle]: { type: "rich_text", rich_text: richText(options.aiTitle || "") },
    [N.PROPERTY_NAMES.aiSummary]: { type: "rich_text", rich_text: richText(options.aiSummary || "") },
    [N.PROPERTY_NAMES.provisionalTopics]: { type: "rich_text", rich_text: richText(options.provisionalTopics || "") },
    [N.PROPERTY_NAMES.aiKeywords]: { type: "rich_text", rich_text: richText(options.aiKeywords || "") },
    [N.PROPERTY_NAMES.aiTopics]: { type: "multi_select", multi_select: options.aiTopics || [] }
  };
  return {
    object: "page",
    id,
    url: `https://www.notion.so/${id.replaceAll("-", "")}`,
    parent: { type: "data_source_id", data_source_id: options.dataSourceId || SOURCE_A, database_id: DATABASE_A },
    archived: options.archived === true,
    in_trash: options.inTrash === true,
    properties
  };
}

function dataSource(properties = N.analysisPropertySchema()) {
  return {
    object: "data_source",
    id: SOURCE_A,
    parent: { type: "database_id", database_id: DATABASE_A },
    properties: { Name: { type: "title", title: {} }, ...clone(properties) }
  };
}

function storageArea(data, writes) {
  return {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.filter(key => Object.hasOwn(data, key)).map(key => [key, clone(data[key])]));
    },
    async set(value) {
      writes.set += 1;
      Object.assign(data, clone(value));
    },
    async remove(keys) {
      writes.remove += 1;
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
    async setAccessLevel() {}
  };
}

function createHarness() {
  const localData = {
    [CONFIG_KEY]: {
      aiProvider: "gemini",
      dataSourceId: SOURCE_A,
      databaseId: DATABASE_A,
      notionTarget: SOURCE_A,
      geminiModel: "gemini-test",
      vertexModel: "gemini-test",
      rememberGeminiKey: false,
      rememberNotionToken: false,
      rememberVertexKey: false
    },
    [STATE_KEY]: {
      current: null,
      failed: [],
      mode: "idle",
      paused: true,
      queue: [],
      recent: [],
      running: false,
      knownPending: null,
      pendingScan: null,
      topicReview: null
    }
  };
  const sessionData = { [TOKEN_KEY]: "test-token" };
  const writes = { set: 0, remove: 0 };
  let fetchImpl = async () => response({ message: "unexpected request" }, 500);
  let listener;
  const context = vm.createContext({
    AbortController,
    DOMException,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: (...args) => fetchImpl(...args),
    setTimeout,
    structuredClone,
    chrome: {
      alarms: { create() {}, onAlarm: { addListener() {} } },
      runtime: {
        id: "siftly-article-selection-test",
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onMessage: { addListener(fn) { listener = fn; } },
        async openOptionsPage() {}
      },
      storage: {
        local: storageArea(localData, writes),
        session: storageArea(sessionData, writes)
      }
    }
  });
  context.globalThis = context;
  context.importScripts = (...names) => {
    for (const name of names) vm.runInContext(source(name), context, { filename: name });
  };
  vm.runInContext(source("background.js"), context, { filename: "background.js" });

  return {
    context,
    localData,
    writes,
    setFetch(fn) { fetchImpl = fn; },
    async send(message) {
      return new Promise(resolve => listener(message, { id: context.chrome.runtime.id }, resolve));
    },
    resetWrites() { writes.set = 0; writes.remove = 0; }
  };
}

function requestInfo(url, options) {
  return {
    path: new URL(url).pathname,
    search: new URL(url).search,
    method: options?.method || "GET",
    body: options?.body ? JSON.parse(options.body) : null
  };
}

function testNotionSelectionHelpers() {
  assert.equal(N.STATUS_NAMES.skipped, "不分析");
  assert.equal(N.STATUS_OPTIONS.skipped.names.en, "Skipped");

  const valid = page(PAGE_1);
  assert.equal(F.isUnanalyzedArticle(valid), true);
  assert.equal(F.isUnanalyzedArticle(page(PAGE_1, { status: N.STATUS_NAMES.skipped })), false);
  assert.equal(F.isUnanalyzedArticle(page(PAGE_1, { aiTitle: " " })), false, "空白但存在的內容也要保護");
  assert.equal(F.isUnanalyzedArticle(page(PAGE_1, { aiTopics: [{ name: "主題" }] })), false);
  assert.equal(F.isUnanalyzedArticle(page(PAGE_1, { archived: true })), false);
  assert.equal(F.isUnanalyzedArticle(page(PAGE_1, { inTrash: true })), false);

  const missingProperties = { ...valid, properties: { Name: valid.properties.Name } };
  assert.equal(F.isUnanalyzedArticle(missingProperties), true, "缺少 AI 欄位時視為空白");

  const existingStatus = {
    type: "select",
    select: {
      options: [
        { id: "custom-id", name: "自訂狀態", color: "purple" },
        { id: "skip-id", name: N.STATUS_NAMES.skipped, color: "gray" },
        { id: "pending-id", name: N.STATUS_NAMES.pending, color: "yellow" }
      ]
    }
  };
  const schema = N.resolveColumnMap({ [N.PROPERTY_NAMES.processingStatus]: existingStatus }, null, "zh");
  const statusOptions = schema.missing[N.PROPERTY_NAMES.processingStatus].select.options;
  assert.deepEqual(statusOptions.slice(0, 3), [
    { id: "custom-id" }, { id: "skip-id" }, { id: "pending-id" }
  ], "自訂與既有不分析選項不可被覆寫");

  const payload = F.unanalyzedQueryPayload("cursor-1", 9);
  assert.equal(payload.page_size, 9, "顯式 pageSize 會保留 1～50 範圍");
  assert.equal(payload.start_cursor, "cursor-1");
  assert.equal(payload.sorts[0].timestamp, "created_time");
  assert.equal(payload.sorts[0].direction, "descending");
  assert.equal(payload.filter.and.length, 6);
  assert.equal(F.unanalyzedQueryPayload("", 100).page_size, 50);
  assert.ok(payload.filter.and.every(item => item.property
    && Object.values(item).some(value => value?.is_empty === true)));
}

async function testListReadOnlyPreviewAndCursor(harness) {
  const calls = [];
  const missingCursorTarget = await harness.send({
    type: "LIST_UNANALYZED_ARTICLES",
    cursor: "next"
  });
  assert.equal(missingCursorTarget.ok, false);
  harness.setFetch(async (url, options) => {
    const request = requestInfo(url, options);
    calls.push(request);
    if (request.path === `/v1/data_sources/${SOURCE_A}`) return response(dataSource());
    if (request.path === `/v1/data_sources/${SOURCE_A}/query`) {
      if (request.body.start_cursor === "next") {
        return response({ results: [page(PAGE_2, { title: "第二篇" })], has_more: false, next_cursor: null });
      }
      return response({ results: [page(PAGE_1, { title: "第一篇" })], has_more: true, next_cursor: "next" });
    }
    if (request.path === `/v1/blocks/${PAGE_1}/children`) {
      return response({ results: Array.from({ length: 10 }, (_, index) => ({
        type: "paragraph",
        paragraph: { rich_text: richText(`預覽 ${index + 1}`) }
      })) });
    }
    if (request.path === `/v1/blocks/${PAGE_2}/children`) return response({ results: [] }, 400);
    return response({ message: "unexpected" }, 500);
  });

  harness.resetWrites();
  const first = await harness.send({
    type: "LIST_UNANALYZED_ARTICLES",
    dataSourceId: SOURCE_A,
    pageSize: 10
  });
  assert.equal(first.ok, true);
  assert.equal(first.data.dataSourceId, SOURCE_A);
  assert.equal(first.data.pages.length, 1);
  assert.equal(first.data.pages[0].title, "第一篇");
  assert.match(first.data.pages[0].preview, /預覽 1/);
  assert.equal(calls.find(call => call.path === `/v1/blocks/${PAGE_1}/children`).search, "?page_size=10");
  assert.deepEqual(Object.keys(first.data.pages[0]).sort(), [
    "id", "lastEditedTime", "preview", "previewUnavailable", "title", "url"
  ].sort(), "文章清單不得回傳 AI 欄位");
  assert.equal(first.data.previewUnavailable, undefined);
  assert.equal(first.data.hasMore, true);
  assert.equal(first.data.nextCursor, "next");
  assert.equal(calls.filter(call => call.method === "PATCH").length, 0, "預覽不能寫入 Notion");
  assert.equal(harness.localData[STATE_KEY].pendingScan, null);

  const second = await harness.send({ type: "LIST_UNANALYZED_ARTICLES", dataSourceId: SOURCE_A, cursor: "next", pageSize: 10 });
  assert.equal(second.ok, true);
  assert.equal(second.data.pages[0].id, PAGE_2);
  assert.equal(second.data.pages[0].previewUnavailable, true);
  assert.equal(calls.filter(call => call.path.endsWith("/query"))[1].body.start_cursor, "next");

  const beforeQueries = calls.filter(call => call.path.endsWith("/query")).length;
  const mismatch = await harness.send({ type: "LIST_UNANALYZED_ARTICLES", dataSourceId: SOURCE_B });
  assert.equal(mismatch.ok, false);
  assert.equal(calls.filter(call => call.path.endsWith("/query")).length, beforeQueries, "跨資料庫不得查詢");

  let drifted = false;
  harness.setFetch(async (url, options) => {
    const request = requestInfo(url, options);
    if (request.path === `/v1/data_sources/${SOURCE_A}`) return response(dataSource());
    if (request.path === `/v1/data_sources/${SOURCE_A}/query`) {
      drifted = true;
      harness.localData[CONFIG_KEY].dataSourceId = SOURCE_B;
      return response({ results: [page(PAGE_1)], has_more: false, next_cursor: null });
    }
    if (request.path === `/v1/blocks/${PAGE_1}/children`) return response({ results: [] });
    return response({ message: "unexpected" }, 500);
  });
  const changedDuringList = await harness.send({ type: "LIST_UNANALYZED_ARTICLES", dataSourceId: SOURCE_A });
  assert.equal(drifted, true);
  assert.equal(changedDuringList.ok, false, "資料庫切換後不得回傳舊清單");
  harness.localData[CONFIG_KEY].dataSourceId = SOURCE_A;
}

async function testStatusSelectionPartialFailureAndRetry(harness) {
  const calls = [];
  let failPage3 = true;
  const pages = {
    [PAGE_1]: page(PAGE_1, { title: "可更新" }),
    [PAGE_2]: page(PAGE_2, { title: "跨資料庫", dataSourceId: SOURCE_B }),
    [PAGE_3]: page(PAGE_3, { title: "暫時失敗" }),
    [PAGE_4]: page(PAGE_4, { title: "暫時失敗" }),
    [PAGE_5]: page(PAGE_5, { title: "不分析測試" })
  };
  harness.setFetch(async (url, options) => {
    const request = requestInfo(url, options);
    calls.push(request);
    if (request.path === `/v1/data_sources/${SOURCE_A}`) return response(dataSource());
    if (request.path === `/v1/data_sources/${SOURCE_A}/query`) {
      return response({ results: [pages[PAGE_3], pages[PAGE_5]], has_more: false, next_cursor: null });
    }
    if (request.path === `/v1/blocks/${PAGE_3}/children` || request.path === `/v1/blocks/${PAGE_5}/children`) {
      return response({ results: [] });
    }
    const match = request.path.match(/^\/v1\/pages\/([^/]+)$/);
    if (match && request.method === "GET") {
      const item = pages[match[1]];
      return item ? response(clone(item)) : response({ message: "missing" }, 404);
    }
    if (match && request.method === "PATCH") {
      if (match[1] === PAGE_3 && failPage3) return response({ message: "temporary failure" }, 400);
      const nextStatus = request.body.properties[N.PROPERTY_NAMES.processingStatus].select.name;
      pages[match[1]].properties[N.PROPERTY_NAMES.processingStatus] = { type: "select", select: { name: nextStatus } };
      return response(clone(pages[match[1]]));
    }
    return response({ message: "unexpected" }, 500);
  });

  vm.runInContext("stateCache.running = false; stateCache.current = null;", harness.context);
  const listed = await harness.send({ type: "LIST_UNANALYZED_ARTICLES", dataSourceId: SOURCE_A });
  assert.equal(listed.ok, true);
  assert.ok([...listed.data.pages].some(item => item.id === PAGE_3));
  pages[PAGE_3].properties[N.PROPERTY_NAMES.aiSummary] = {
    type: "rich_text", rich_text: richText("剛剛新增的內容")
  };
  const changedAfterList = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: [PAGE_3],
    status: N.STATUS.pending
  });
  assert.equal(changedAfterList.ok, true);
  assert.deepEqual([...changedAfterList.data.updatedIds], []);
  assert.ok([...changedAfterList.data.skipped].some(item => item.id === PAGE_3));
  assert.equal(calls.filter(call => call.method === "PATCH").length, 0, "資格改變的候選不得 PATCH");
  pages[PAGE_3].properties[N.PROPERTY_NAMES.aiSummary] = { type: "rich_text", rich_text: [] };

  const queueBefore = [{ id: "keep-queue-item", aiSummary: "queue stays" }];
  vm.runInContext(
    `stateCache.pendingScan = { pages: [{ id: "old-scan" }] }; stateCache.knownPending = 9; stateCache.lastScanAt = "old"; stateCache.queue = ${JSON.stringify(queueBefore)};`,
    harness.context
  );
  const result = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: [PAGE_1, PAGE_1, PAGE_2, PAGE_3, PAGE_4],
    status: N.STATUS.pending
  });
  assert.equal(result.ok, true);
  assert.deepEqual([...result.data.updatedIds], [PAGE_1, PAGE_4]);
  assert.deepEqual([...result.data.failed].map(item => item.id), [PAGE_3]);
  assert.ok(result.data.skipped.some(item => item.id === PAGE_2));
  assert.equal(result.data.dataSourceId, SOURCE_A);
  assert.equal(vm.runInContext("stateCache.pendingScan", harness.context), null);
  assert.equal(vm.runInContext("stateCache.knownPending", harness.context), null);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(stateCache.queue)", harness.context)), queueBefore);
  assert.deepEqual(pages[PAGE_1].properties[N.PROPERTY_NAMES.aiSummary].rich_text, [], "狀態更新不得寫入 AI 欄位");
  const patches = calls.filter(call => call.method === "PATCH");
  assert.equal(patches.length, 3, "失敗文章仍會留下可重試的 PATCH 失敗紀錄");
  for (const patch of patches) assert.deepEqual(Object.keys(patch.body.properties), [N.PROPERTY_NAMES.processingStatus]);

  failPage3 = false;
  const retry = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: [PAGE_1, PAGE_3, PAGE_4],
    status: N.STATUS.pending
  });
  assert.equal(retry.ok, true);
  assert.deepEqual([...retry.data.updatedIds], [PAGE_3]);
  assert.ok(retry.data.skipped.some(item => item.id === PAGE_1));
  assert.ok(retry.data.skipped.some(item => item.id === PAGE_4));

  const skipped = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: [PAGE_5],
    status: N.STATUS.skipped
  });
  assert.equal(skipped.ok, true);
  assert.deepEqual([...skipped.data.updatedIds], [PAGE_5]);
  const skippedPatch = calls.filter(call => call.method === "PATCH").at(-1);
  assert.equal(skippedPatch.body.properties[N.PROPERTY_NAMES.processingStatus].select.name, N.STATUS_NAMES.skipped);
  const afterSkipList = await harness.send({ type: "LIST_UNANALYZED_ARTICLES", dataSourceId: SOURCE_A });
  assert.equal(afterSkipList.ok, true);
  assert.equal([...afterSkipList.data.pages].some(item => item.id === PAGE_5), false);
}

async function testInputValidationAndBusy(harness) {
  const invalidStatus = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: [PAGE_1],
    status: "不存在的狀態"
  });
  assert.equal(invalidStatus.ok, false);

  const invalidPageId = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: ["not-a-uuid"],
    status: N.STATUS.pending
  });
  assert.equal(invalidPageId.ok, false);

  const tooMany = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: Array.from({ length: 51 }, (_, index) => {
      const value = (index + 1).toString(16).padStart(32, "0");
      return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20)}`;
    }),
    status: N.STATUS.pending
  });
  assert.equal(tooMany.ok, false);

  vm.runInContext("stateCache.running = true;", harness.context);
  const busy = await harness.send({
    type: "SET_ARTICLE_ANALYSIS_STATUS",
    dataSourceId: SOURCE_A,
    pageIds: [PAGE_1],
    status: N.STATUS.pending
  });
  assert.equal(busy.ok, false);
  vm.runInContext("stateCache.running = false;", harness.context);
}

async function testArticleSelectionBusyLock(harness) {
  let enteredQuery = false;
  let releaseQuery;
  const heldQuery = new Promise(resolve => { releaseQuery = resolve; });
  harness.setFetch(async (url, options) => {
    const request = requestInfo(url, options);
    if (request.path === `/v1/data_sources/${SOURCE_A}`) return response(dataSource());
    if (request.path === `/v1/data_sources/${SOURCE_A}/query`) {
      enteredQuery = true;
      await heldQuery;
      return response({ results: [], has_more: false, next_cursor: null });
    }
    return response({ message: "unexpected" }, 500);
  });
  vm.runInContext("stateCache.running = false; stateCache.current = null; stateCache.queue = [];", harness.context);

  const listPromise = harness.send({ type: "LIST_UNANALYZED_ARTICLES", dataSourceId: SOURCE_A });
  while (!enteredQuery) await new Promise(resolve => setTimeout(resolve, 0));

  for (const message of [
    {
      type: "SET_ARTICLE_ANALYSIS_STATUS",
      dataSourceId: SOURCE_A,
      pageIds: [PAGE_1],
      status: N.STATUS.pending
    },
    { type: "ANALYZE_ALL" },
    { type: "SAVE_SETTINGS", settings: {} }
  ]) {
    const blocked = await harness.send(message);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error.code, "ARTICLE_SELECTION_BUSY");
  }

  releaseQuery();
  const completed = await listPromise;
  assert.equal(completed.ok, true);
  const afterRelease = await harness.send({ type: "LIST_UNANALYZED_ARTICLES", dataSourceId: SOURCE_A });
  assert.equal(afterRelease.ok, true, "清單完成後應解除 busy lock");
}

async function main() {
  testNotionSelectionHelpers();
  const harness = createHarness();
  await testListReadOnlyPreviewAndCursor(harness);
  await testStatusSelectionPartialFailureAndRetry(harness);
  await testArticleSelectionBusyLock(harness);
  await testInputValidationAndBusy(harness);
  console.log("article selection tests passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
