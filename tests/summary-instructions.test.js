"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const CONFIG_KEY = "notionAiAnalyzerConfig";
const STATE_KEY = "notionAiAnalyzerState";
const EXTENSION_ID = "siftly-summary-instructions-test";
const P = require(path.join(root, "prompt.js"));
const G = require(path.join(root, "gemini.js"));

function source(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function userText(payload) {
  return payload.contents?.[0]?.parts?.[0]?.text ?? "";
}

function systemText(payload) {
  return payload.systemInstruction?.parts?.[0]?.text ?? "";
}

function testPromptNormalisationAndScope() {
  const instructions = "  用輕鬆自然的語氣，少用術語；優先保留實作方法與限制。  ";
  assert.equal(P.normalizeSummaryInstructions(instructions), instructions.trim());
  assert.equal(P.normalizeSummaryInstructions(" \t第一行 \n\n\n第二行\t "), "第一行\n\n第二行");
  assert.equal(P.normalizeSummaryInstructions("\n\t  "), "");
  assert.equal(P.normalizeSummaryInstructions(null), "");
  assert.equal(P.normalizeSummaryInstructions({ value: instructions }), "");
  assert.equal(P.normalizeSummaryInstructions(instructions.repeat(100)), instructions.repeat(100).trim().slice(0, 2000));

  const defaultPrompt = P.buildSystemPrompt("", P.DEFAULT_OUTPUT_SPEC, "");
  assert.equal(defaultPrompt, P.SYSTEM_PROMPT, "空白摘要指引不得改變既有 system prompt");

  const customisedPrompt = P.buildSystemPrompt("", P.DEFAULT_OUTPUT_SPEC, instructions);
  assert.notEqual(customisedPrompt, defaultPrompt);
  assert.match(customisedPrompt, /ai_summary/);
  assert.match(customisedPrompt, /繁體中文/);
  assert.match(customisedPrompt, /臺灣/);
  assert.match(customisedPrompt, /JSON/);
  assert.match(customisedPrompt, /用輕鬆自然的語氣，少用術語；優先保留實作方法與限制/);
  assert.match(customisedPrompt, /SUMMARY WRITING PREFERENCES/);
  assert.match(customisedPrompt, /ai_summary only/);
}

function testRequestPropagationAndIsolation() {
  const instructions = "使用學術語氣，保留定義、證據與限制。";
  const analysis = G.buildAnalysisRequest("文章內容", "gemini-test", {
    summaryInstructions: instructions
  });
  const repair = G.buildRepairRequest("bad output", ["格式錯誤"], "gemini-test", {
    summaryInstructions: instructions
  });
  assert.match(systemText(analysis), /使用學術語氣，保留定義、證據與限制/);
  assert.match(systemText(repair), /使用學術語氣，保留定義、證據與限制/);
  assert.doesNotMatch(userText(analysis), /使用學術語氣，保留定義、證據與限制/);
  assert.doesNotMatch(userText(repair), /使用學術語氣，保留定義、證據與限制/);

  const chunk = G.buildChunkRequest("片段內容", 1, 2, "gemini-test");
  const chunkRepair = G.buildChunkRepairRequest("bad notes", ["格式錯誤"], "gemini-test");
  const organizer = G.buildTopicOrganizerRequest(["主題一", "主題二"], [], "gemini-test", {
    summaryInstructions: instructions
  });
  const organizerRepair = G.buildTopicOrganizerRepairRequest(
    "bad groups",
    ["格式錯誤"],
    ["主題一", "主題二"],
    [],
    "gemini-test",
    { summaryInstructions: instructions }
  );
  for (const payload of [chunk, chunkRepair, organizer, organizerRepair]) {
    assert.doesNotMatch(systemText(payload), /使用學術語氣，保留定義、證據與限制/);
    assert.doesNotMatch(userText(payload), /使用學術語氣，保留定義、證據與限制/);
  }
}

function storageArea(data, session = false) {
  return {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.filter(name => Object.hasOwn(data, name)).map(name => [name, data[name]]));
    },
    async set(value) {
      Object.assign(data, structuredClone(value));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
    ...(session ? { async setAccessLevel() {} } : {})
  };
}

function createBackgroundContext() {
  const localData = {
    [CONFIG_KEY]: {
      aiProvider: "gemini",
      geminiModel: "gemini-test",
      vertexModel: "vertex-test",
      notionTarget: "",
      dataSourceId: "",
      databaseId: "",
      summaryInstructions: "既有摘要偏好",
      requestTimeoutMinutes: 5,
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
      running: false
    }
  };
  let messageListener = null;
  const context = vm.createContext({
    AbortController,
    DOMException,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async () => {
      throw new Error("unexpected network call");
    },
    setTimeout,
    structuredClone,
    chrome: {
      alarms: {
        create() {},
        onAlarm: { addListener() {} }
      },
      runtime: {
        id: EXTENSION_ID,
        onInstalled: { addListener() {} },
        onMessage: { addListener(listener) { messageListener = listener; } },
        onStartup: { addListener() {} },
        async openOptionsPage() {}
      },
      storage: {
        local: storageArea(localData),
        session: storageArea({}, true)
      }
    }
  });
  context.globalThis = context;
  context.importScripts = (...names) => {
    for (const name of names) {
      vm.runInContext(source(name), context, { filename: name });
    }
  };
  vm.runInContext(source("background.js"), context, { filename: "background.js" });

  function send(message) {
    return new Promise(resolve => messageListener(message, { id: EXTENSION_ID }, resolve));
  }

  return { context, localData, send };
}

async function testConfigPersistence() {
  const { localData, send } = createBackgroundContext();
  const initial = await send({ type: "GET_CONFIG" });
  assert.equal(initial.ok, true);
  assert.equal(initial.data.summaryInstructions, "既有摘要偏好");
  assert.equal(initial.data.analysisPrompt, undefined);
  assert.equal(initial.data.analysisPromptCustomized, undefined);

  const beforeSummaryOnly = structuredClone(localData[CONFIG_KEY]);
  const applied = await send({
    type: "SAVE_SETTINGS",
    summaryOnly: true,
    settings: { summaryInstructions: "  使用輕鬆語氣，優先保留具體例子。  " }
  });
  assert.equal(applied.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(applied.data)), {
    summaryInstructions: "使用輕鬆語氣，優先保留具體例子。"
  });
  assert.equal(localData[CONFIG_KEY].summaryInstructions, "使用輕鬆語氣，優先保留具體例子。");
  for (const [key, value] of Object.entries(beforeSummaryOnly)) {
    if (key === "summaryInstructions") continue;
    assert.deepEqual(localData[CONFIG_KEY][key], value, `summaryOnly 不得修改 ${key}`);
  }

  const invalidType = await send({
    type: "SAVE_SETTINGS",
    summaryOnly: true,
    settings: { summaryInstructions: 123 }
  });
  assert.equal(invalidType.ok, false);
  assert.equal(invalidType.error.code, "SUMMARY_INSTRUCTIONS_INVALID");
  assert.equal(localData[CONFIG_KEY].summaryInstructions, "使用輕鬆語氣，優先保留具體例子。");

  const invalidLength = await send({
    type: "SAVE_SETTINGS",
    summaryOnly: true,
    settings: { summaryInstructions: "x".repeat(2001) }
  });
  assert.equal(invalidLength.ok, false);
  assert.equal(invalidLength.error.code, "SUMMARY_INSTRUCTIONS_INVALID");
  assert.equal(localData[CONFIG_KEY].summaryInstructions, "使用輕鬆語氣，優先保留具體例子。");

  const omitted = await send({
    type: "SAVE_SETTINGS",
    settings: { geminiModel: "gemini-test-2" }
  });
  assert.equal(omitted.ok, true);
  assert.equal(localData[CONFIG_KEY].summaryInstructions, "使用輕鬆語氣，優先保留具體例子。", "一般保存省略欄位時應保留既有摘要指引");
  assert.equal(localData[CONFIG_KEY].geminiModel, "gemini-test-2");

  const reset = await send({
    type: "SAVE_SETTINGS",
    summaryOnly: true,
    settings: { summaryInstructions: "   " }
  });
  assert.equal(reset.ok, true);
  assert.equal(localData[CONFIG_KEY].summaryInstructions, "", "恢復預設應立即保存空字串");
  const afterReset = await send({ type: "GET_CONFIG" });
  assert.equal(afterReset.ok, true);
  assert.equal(afterReset.data.summaryInstructions, "");
  assert.equal(afterReset.data.analysisPrompt, undefined);
  assert.equal(afterReset.data.analysisPromptCustomized, undefined);
}

testPromptNormalisationAndScope();
testRequestPropagationAndIsolation();
testConfigPersistence().then(() => {
  console.log("summary instruction tests passed");
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
