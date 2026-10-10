"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const CONFIG_KEY = "notionAiAnalyzerConfig";
const STATE_KEY = "notionAiAnalyzerState";
const EXTENSION_ID = "siftly-output-language-test";
const S = require(path.join(root, "shared.js"));
const P = require(path.join(root, "prompt.js"));
const G = require(path.join(root, "gemini.js"));
const N = require(path.join(root, "notion.js"));

function source(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function userText(payload) {
  return payload.contents?.[0]?.parts?.[0]?.text ?? "";
}

function systemText(payload) {
  return payload.systemInstruction?.parts?.[0]?.text ?? "";
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function englishWords(count) {
  const words = ["clear", "source", "context", "method", "result", "reason", "change", "detail"];
  return Array.from({ length: count }, (_, index) => words[index % words.length]).join(" ");
}

function englishAnalysis(overrides = {}) {
  return {
    ai_title: "Clear Article Summary",
    ai_topics: ["Machine Learning"],
    ai_keywords: ["machine learning", "evaluation", "workflow", "evidence", "quality"],
    ai_summary: englishWords(80),
    ...overrides
  };
}

function chineseAnalysis(overrides = {}) {
  return {
    ai_title: "人工智慧應用",
    ai_topics: ["人工智慧"],
    ai_keywords: ["人工智慧", "分析流程", "資料品質", "實作方法", "使用限制"],
    ai_summary: `這段內容說明實作方法、使用情境與限制。${"保留重要細節。".repeat(20)}`,
    ...overrides
  };
}

function testLanguageAndSpecNormalisation() {
  assert.equal(P.normalizeOutputLanguage("en"), "en");
  assert.equal(P.normalizeOutputLanguage("en-US"), "zh-TW");
  assert.equal(P.normalizeOutputLanguage("zh-TW"), "zh-TW");
  assert.equal(P.normalizeOutputLanguage("English"), "zh-TW");
  assert.deepEqual(P.DEFAULT_ENGLISH_OUTPUT_SPEC, {
    titleMax: 10,
    topicMin: 1,
    topicMax: 3,
    keywordCount: 5,
    summaryMin: 80,
    summaryMax: 150
  });

  assert.deepEqual(P.normalizeOutputSpec({
    titleMax: 1,
    topicMin: 0,
    topicMax: 99,
    keywordCount: 99,
    summaryMin: 1,
    summaryMax: 999
  }, "en"), {
    titleMax: 4,
    topicMin: 1,
    topicMax: 5,
    keywordCount: 10,
    summaryMin: 30,
    summaryMax: 800
  });
  assert.deepEqual(P.normalizeOutputSpec({ titleMax: 19, summaryMin: 500, summaryMax: 100 }, "en"), {
    titleMax: 19,
    topicMin: 1,
    topicMax: 3,
    keywordCount: 5,
    summaryMin: 500,
    summaryMax: 500
  });
  assert.deepEqual(P.normalizeOutputSpec({ titleMax: 30, summaryMin: 500, summaryMax: 100 }), {
    titleMax: 30,
    topicMin: 1,
    topicMax: 3,
    keywordCount: 5,
    summaryMin: 500,
    summaryMax: 500
  });
  assert.equal(S.wordCount("One small, well-tested example 12.5%"), 5);
}

function testPromptLanguageAndChineseRegression() {
  const chinese = P.buildSystemPrompt("", P.DEFAULT_OUTPUT_SPEC, "", "zh-TW");
  assert.equal(chinese, P.SYSTEM_PROMPT, "中文預設 prompt 必須保持原樣");
  const builtInPrompts = [P.DEFAULT_ANALYSIS_PROMPT, P.SYSTEM_PROMPT, P.CHUNK_SYSTEM_PROMPT,
    P.TOPIC_ORGANIZER_SYSTEM_PROMPT, P.TOPIC_STANDARD_MATCHER_SYSTEM_PROMPT];
  const promptHash = crypto.createHash("sha256").update(JSON.stringify(builtInPrompts)).digest("hex").toUpperCase();
  assert.equal(promptHash, "A356D43BC3E551E5733F8BE4A1F618268AF983B772C559BF5A4C4DFDF4754281");

  assert.match(chinese, /NON-NEGOTIABLE OUTPUT CONTRACT[\s\S]*Taiwan wording[\s\S]*SECURITY/, "固定契約必須要求臺灣用語");
  assert.match(JSON.stringify(G.analysisJsonSchema()), /臺灣用語/, "中文 schema 說明必須提到臺灣用語");

  const english = P.buildSystemPrompt("", P.DEFAULT_ENGLISH_OUTPUT_SPEC, "", "en");
  assert.match(english, /English/i);
  assert.match(english, /words?/i);
  assert.doesNotMatch(english, /所有輸出必須使用繁體中文|臺灣慣用語|最多 5 個?字|2 至 4 個?字/);
}

function testAllBuildersCarryEnglishLanguageRules() {
  const options = { outputLanguage: "en", outputSpec: P.DEFAULT_ENGLISH_OUTPUT_SPEC };
  const payloads = [
    G.buildAnalysisRequest("source", "gemini-test", options),
    G.buildRepairRequest("bad", ["invalid"], "gemini-test", options),
    G.buildChunkRequest("chunk", 1, 2, "gemini-test", options),
    G.buildChunkRepairRequest("bad notes", ["invalid"], "gemini-test", options),
    G.buildTopicOrganizerRequest(["machine learning", "neural networks"], [], "gemini-test", options),
    G.buildTopicOrganizerCompatibilityRequest(["machine learning", "neural networks"], [], "gemini-test", options),
    G.buildTopicOrganizerRepairRequest("bad groups", ["invalid"], ["machine learning", "neural networks"], [], "gemini-test", options),
    G.buildTopicStandardMatcherRequest([
      { group_id: "group_1", proposed_topic: "AI Methods", source_topics: ["machine learning", "neural networks"] }
    ], [{ name: "Artificial Intelligence" }], "gemini-test", options),
    G.buildTopicStandardMatcherCompatibilityRequest([
      { group_id: "group_1", proposed_topic: "AI Methods", source_topics: ["machine learning", "neural networks"] }
    ], [{ name: "Artificial Intelligence" }], "gemini-test", options),
    G.buildTopicStandardMatcherRepairRequest("bad matches", ["invalid"], [
      { group_id: "group_1", proposed_topic: "AI Methods", source_topics: ["machine learning", "neural networks"] }
    ], [{ name: "Artificial Intelligence" }], "gemini-test", options)
  ];
  for (const payload of payloads) {
    const text = `${systemText(payload)}\n${userText(payload)}`;
    assert.match(text, /English|英語/i);
    assert.doesNotMatch(text, /使用繁體中文|所有輸出必須使用繁體中文|臺灣慣用語/);
    assert.doesNotMatch(text, /最多 5 個?字|2 至 6 個?可見字元|2～6 字|2 至 4 字/);
  }
}

function testLanguageAwareValidation() {
  const englishSpec = P.DEFAULT_ENGLISH_OUTPUT_SPEC;
  const english = G.validateAnalysis(englishAnalysis(), [], true, [], englishSpec, "en");
  assert.equal(english.ok, true, english.errors?.join("；"));
  assert.equal(G.validateAnalysis(
    englishAnalysis({ ai_title: "One Two Three Four Five Six Seven Eight Nine Ten Eleven" }),
    [], true, [], englishSpec, "en"
  ).ok, false, "英文標題應依單字數限制");
  assert.equal(G.validateAnalysis(
    englishAnalysis({ ai_summary: englishWords(79) }),
    [], true, [], englishSpec, "en"
  ).ok, false, "英文摘要應依單字數限制");

  const chinese = G.validateAnalysis(chineseAnalysis(), [{ name: "人工智慧" }], false, [], P.DEFAULT_OUTPUT_SPEC, "zh-TW");
  assert.equal(chinese.ok, true, chinese.errors?.join("；"));
  assert.equal(G.validateAnalysis(
    chineseAnalysis({ ai_summary: `這段內容說明實作方法。${"保留細節。".repeat(16)}` }),
    [{ name: "人工智慧" }], false, [], P.DEFAULT_OUTPUT_SPEC, "zh-TW"
  ).ok, false, "中文摘要應依可見字元數限制");

  const known = G.validateAnalysis(
    englishAnalysis({ ai_topics: ["machine learning"] }),
    [{ name: "Machine Learning" }], false, [], englishSpec, "en"
  );
  assert.equal(known.ok, true, known.errors?.join("；"));
  assert.deepEqual(known.value.ai_topics, ["Machine Learning"], "既有主題名稱必須保留 canonical spelling");
}

function testTopicOrganizerLanguageAwareValidation() {
  const candidates = ["machine learning", "neural networks"];
  const proposal = G.validateTopicOrganizer({
    groups: [{
      standard_topic: "AI Methods",
      source_topics: candidates,
      definition: "Methods used to build learning systems.",
      keep_separate: [],
      reason: "Both labels describe methods used to build learning systems.",
      confidence: "high"
    }],
    unclassified_topics: []
  }, candidates, [], "en");
  assert.equal(proposal.ok, true, proposal.errors?.join("；"));
  assert.equal(proposal.value.groups[0].standard_topic, "AI Methods");

  const existing = G.validateTopicOrganizer({
    groups: [{
      standard_topic: "Artificial Intelligence",
      source_topics: candidates,
      definition: "Existing canonical taxonomy label.",
      keep_separate: [],
      reason: "The existing label covers both source topics.",
      confidence: "high"
    }],
    unclassified_topics: []
  }, candidates, [{ name: "Artificial Intelligence" }], "en");
  assert.equal(existing.ok, true, existing.errors?.join("；"));
  assert.equal(existing.value.groups[0].standard_topic, "Artificial Intelligence");

  const tooManyWords = G.validateTopicOrganizer({
    groups: [{
      standard_topic: "One Two Three Four Five",
      source_topics: candidates,
      reason: "Too many words for an English topic label."
    }],
    unclassified_topics: []
  }, candidates, [], "en");
  assert.equal(tooManyWords.ok, true);
  assert.equal(tooManyWords.value.groups.length, 0);
  assert.deepEqual(tooManyWords.value.unclassified_topics, candidates);
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
  const chineseSpec = { titleMax: 14, topicMin: 1, topicMax: 4, keywordCount: 6, summaryMin: 120, summaryMax: 300 };
  const englishSpec = { titleMax: 12, topicMin: 1, topicMax: 2, keywordCount: 5, summaryMin: 90, summaryMax: 180 };
  const localData = {
    [CONFIG_KEY]: {
      aiProvider: "gemini",
      geminiModel: "gemini-test",
      vertexModel: "vertex-test",
      notionTarget: "",
      dataSourceId: "",
      databaseId: "",
      outputSpec: chineseSpec,
      englishOutputSpec: englishSpec,
      outputLanguage: "zh-TW",
      summaryInstructions: "",
      requestTimeoutMinutes: 5,
      rememberGeminiKey: false,
      rememberNotionToken: false,
      rememberVertexKey: false
    },
    [STATE_KEY]: {
      current: null, failed: [], mode: "idle", paused: true, queue: [], recent: [], running: false
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
    fetch: async () => { throw new Error("unexpected network call"); },
    setTimeout,
    structuredClone,
    chrome: {
      alarms: { create() {}, onAlarm: { addListener() {} } },
      runtime: {
        id: EXTENSION_ID,
        onInstalled: { addListener() {} },
        onMessage: { addListener(listener) { messageListener = listener; } },
        onStartup: { addListener() {} },
        async openOptionsPage() {}
      },
      storage: { local: storageArea(localData), session: storageArea({}, true) }
    }
  });
  context.globalThis = context;
  context.importScripts = (...names) => {
    for (const name of names) vm.runInContext(source(name), context, { filename: name });
  };
  vm.runInContext(source("background.js"), context, { filename: "background.js" });
  function send(message) {
    return new Promise(resolve => messageListener(message, { id: EXTENSION_ID }, resolve));
  }
  return { context, localData, send, chineseSpec, englishSpec };
}

async function testConfigLanguageProfiles() {
  const { localData, send, chineseSpec, englishSpec } = createBackgroundContext();
  const initial = await send({ type: "GET_CONFIG" });
  assert.equal(initial.ok, true);
  assert.equal(initial.data.outputLanguage, "zh-TW");
  assert.deepEqual(plain(initial.data.outputSpec), P.normalizeOutputSpec(chineseSpec, "zh-TW"));
  assert.deepEqual(plain(initial.data.englishOutputSpec), P.normalizeOutputSpec(englishSpec, "en"));

  const savedEnglish = await send({
    type: "SAVE_SETTINGS",
    settings: {
      outputLanguage: "en",
      outputSpec: { ...chineseSpec, titleMax: 16 },
      englishOutputSpec: { ...P.DEFAULT_ENGLISH_OUTPUT_SPEC, titleMax: 15 }
    }
  });
  assert.equal(savedEnglish.ok, true, savedEnglish.error?.message);
  assert.equal(localData[CONFIG_KEY].outputLanguage, "en");
  assert.equal(localData[CONFIG_KEY].outputSpec.titleMax, 16);
  assert.equal(localData[CONFIG_KEY].englishOutputSpec.titleMax, 15);

  const savedChinese = await send({
    type: "SAVE_SETTINGS",
    settings: { outputLanguage: "zh-TW", outputSpec: { ...chineseSpec, titleMax: 18 } }
  });
  assert.equal(savedChinese.ok, true, savedChinese.error?.message);
  assert.equal(localData[CONFIG_KEY].outputLanguage, "zh-TW");
  assert.equal(localData[CONFIG_KEY].outputSpec.titleMax, 18);
  assert.equal(localData[CONFIG_KEY].englishOutputSpec.titleMax, 15);

  const beforeSummaryOnly = structuredClone(localData[CONFIG_KEY]);
  const summaryOnly = await send({
    type: "SAVE_SETTINGS",
    summaryOnly: true,
    settings: {
      summaryInstructions: "使用簡潔語氣",
      outputLanguage: "en",
      outputSpec: { ...P.DEFAULT_ENGLISH_OUTPUT_SPEC, titleMax: 4 }
    }
  });
  assert.equal(summaryOnly.ok, true, summaryOnly.error?.message);
  assert.equal(localData[CONFIG_KEY].summaryInstructions, "使用簡潔語氣");
  for (const [key, value] of Object.entries(beforeSummaryOnly)) {
    if (key === "summaryInstructions") continue;
    assert.deepEqual(plain(localData[CONFIG_KEY][key]), plain(value), `summaryOnly 不得修改 ${key}`);
  }
}

async function testTopicSnapshotsKeepTheirLanguageAfterConfigSwitch() {
  const { context, send } = createBackgroundContext();
  await send({ type: "GET_CONFIG" });
  const pageWrites = [];
  let topicOptions = [{ name: "人工智慧" }];
  const page = {
    id: "page-1",
    properties: {
      "AI 主題": { multi_select: [{ name: "人工智慧" }] },
      "AI 暫定主題": { rich_text: [{ plain_text: "Machine Learning" }] },
      "整理狀態": { select: { name: "待主題確認" } }
    }
  };
  const config = {
    outputLanguage: "zh-TW",
    dataSourceId: "data-source-1",
    columnMap: { ...N.defaultColumnMap(), dataSourceId: "data-source-1" },
    notionTarget: "",
    topicDictionary: [],
    discardedTopicNames: [],
    topicPageResolutions: []
  };
  context.readyNotion = async () => ({ config, fields: N.bindColumns(config.columnMap), token: "notion-test-token" });
  context.fieldsFor = () => N.bindColumns(config.columnMap);
  context.requireNotionToken = async () => "notion-test-token";
  context.readTopicOptions = async () => topicOptions;
  context.writeConfig = async () => {};
  context.persistState = async () => {};
  context.recordSuccess = () => {};
  context.notionRequest = async (url, options = {}) => {
    if (url === "/v1/pages/page-1" && !options.method) return page;
    if (url.startsWith("/v1/data_sources/") && options.method === "PATCH") {
      topicOptions = [{ name: "人工智慧" }, { name: "Applied Methods" }];
      return {};
    }
    if (url === "/v1/pages/page-1" && options.method === "PATCH") {
      pageWrites.push(options.body);
      return {};
    }
    throw new Error(`unexpected Notion call: ${url}`);
  };

  vm.runInContext(`stateCache.topicOrganizer = ${JSON.stringify({
    version: 10,
    outputLanguage: "en",
    status: "review",
    scannedAt: "2026-10-10T00:00:00.000Z",
    candidates: [{ name: "Machine Learning", occurrences: 1, pageIds: ["page-1"] }],
    pages: [{ id: "page-1", provisionalTopics: ["Machine Learning"], aiTopics: ["人工智慧"], status: "待主題確認" }],
    groups: [{
      id: "group-1",
      standardTopic: "Applied Methods",
      aliases: ["Machine Learning"],
      selectedAliases: ["Machine Learning"],
      selected: true,
      definition: "Methods used in applied learning systems.",
      applied: false,
      skipped: false
    }],
    unclassified: [],
    manualSkipped: [],
    existingTopics: ["人工智慧"],
    appliedCandidateCount: 0,
    warnings: []
  })}; stateCache.topicReview = null; stateCache.running = false;`, context);

  await context.applyTopicOrganizerGroups([{
    id: "group-1",
    selected: true,
    standardTopic: "Applied Methods",
    selectedAliases: ["Machine Learning"],
    definition: "Methods used in applied learning systems."
  }]);
  assert.ok(pageWrites.length >= 1, "英文 organizer snapshot 應能在中文設定下套用");
  const organizerPatch = pageWrites[pageWrites.length - 1];
  const organizerTopics = organizerPatch.properties["AI 主題"].multi_select.map(item => item.name);
  assert.ok(organizerTopics.includes("Applied Methods"));
  assert.ok(organizerTopics.includes("人工智慧"), "既有中文正式 taxonomy 名稱必須保留原名");

  pageWrites.length = 0;
  topicOptions = [{ name: "人工智慧" }];
  vm.runInContext(`stateCache.topicOrganizer = null; stateCache.topicReview = ${JSON.stringify({
    version: 2,
    outputLanguage: "en",
    item: { id: "page-1", title: "Review" },
    result: { ai_topics: ["Machine Learning"] },
    requestedAt: "2026-10-10T00:00:00.000Z",
    candidateTotal: 1,
    remainingCandidates: [{ name: "Machine Learning", reason: "", closest_existing: [] }],
    topicOptions: [{ name: "人工智慧" }],
    originalFinalTopics: ["人工智慧"],
    selectedExistingTopics: [],
    approvedNewTopics: [],
    decisions: [],
    skippedCandidates: [],
    previousMode: "single_review"
  })};`, context);
  await context.resolveTopicReview("custom", "", "Applied Topic", true);
  assert.ok(pageWrites.length >= 1, "英文 review snapshot 應能接受自訂英文主題");
  const reviewPatch = pageWrites[pageWrites.length - 1];
  const reviewTopics = reviewPatch.properties["AI 主題"].multi_select.map(item => item.name);
  assert.ok(reviewTopics.includes("Applied Topic"));
  assert.ok(reviewTopics.includes("人工智慧"), "review 套用自訂主題時不得翻譯既有中文 taxonomy");
}

function createAnalysisContext() {
  const context = vm.createContext({
    G,
    P,
    S,
    AnalyzerGemini: G,
    AnalyzerPrompt: P,
    AnalyzerShared: S,
    t: require(path.join(root, "i18n/index.js")).t,
    console,
    structuredClone,
    setTimeout,
    clearTimeout
  });
  context.globalThis = context;
  context.normalizeExcludedPersonTerms = value => Array.isArray(value) ? value : [];
  context.activeAiContext = async () => ({ apiKey: "test-key", model: "gemini-test", provider: "gemini" });
  context.setStage = async () => {};
  vm.runInContext(source("background/analysis.js"), context, { filename: "background/analysis.js" });
  return context;
}

async function testAnalysisPipelineCarriesLanguage() {
  const shortContext = createAnalysisContext();
  let shortOptions = null;
  shortContext.generateAndValidate = async (...args) => {
    shortOptions = args[8];
    return { ai_title: "ok" };
  };
  await shortContext.analyzeArticle("short article", {
    outputLanguage: "en",
    outputSpec: P.DEFAULT_ENGLISH_OUTPUT_SPEC,
    summaryInstructions: "",
    requestTimeoutMinutes: 5,
    excludedPersonTerms: []
  });
  assert.equal(shortOptions.outputLanguage, "en");

  const longContext = createAnalysisContext();
  const chunkCalls = [];
  let finalOptions = null;
  longContext.extractChunkNote = async (...args) => {
    chunkCalls.push(args);
    return { details: ["detail"], terms: ["term"], transitions: ["change"] };
  };
  longContext.generateAndValidate = async (...args) => {
    finalOptions = args[8];
    return { ai_title: "ok" };
  };
  await longContext.analyzeArticle("x".repeat(G.DIRECT_TEXT_LIMIT + 1), {
    outputLanguage: "en",
    outputSpec: P.DEFAULT_ENGLISH_OUTPUT_SPEC,
    summaryInstructions: "",
    requestTimeoutMinutes: 5,
    excludedPersonTerms: []
  });
  assert.ok(chunkCalls.length > 1, "長文應經過片段筆記流程");
  assert.ok(chunkCalls.every(args => args.some(value => value === "en" || value?.outputLanguage === "en")), "每個片段 request 都必須收到英文語言");
  assert.equal(finalOptions.outputLanguage, "en");
}

async function testRepairPipelineCarriesLanguage() {
  const context = createAnalysisContext();
  const requests = [];
  let attempt = 0;
  context.timedAiRequest = async (_provider, _model, payload) => {
    requests.push(payload);
    attempt += 1;
    const value = attempt === 1
      ? { wrong: "shape" }
      : englishAnalysis();
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] };
  };
  const result = await context.generateAndValidate(
    "source",
    "gemini",
    "gemini-test",
    "test-key",
    undefined,
    [],
    true,
    [],
    { outputLanguage: "en", outputSpec: P.DEFAULT_ENGLISH_OUTPUT_SPEC, requestTimeoutMinutes: 5 }
  );
  assert.equal(result.ai_title, "Clear Article Summary");
  assert.equal(requests.length, 2, "不合格英文輸出應使用英文 repair request");
  for (const payload of requests) {
    assert.match(systemText(payload), /English/i);
    assert.doesNotMatch(systemText(payload), /使用繁體中文|臺灣慣用語/);
  }
}

function testEnglishChunkPathAndSpellingCarryNoChinese() {
  const notes = [{ details: ["A launch"], terms: ["Alpha"], transitions: [] }];
  const english = G.formatChunkNotes(notes, "en");
  assert.doesNotMatch(english, /[一-鿿]/u, "英文長文筆記不可含中文標籤");
  assert.match(G.formatChunkNotes(notes), /第 1 段/, "中文筆記格式維持不變");
  assert.doesNotMatch(JSON.stringify(G.chunkJsonSchema("en")), /[一-鿿]/u, "英文分段 schema 不可含中文");
  assert.match(JSON.stringify(G.chunkJsonSchema("zh-TW")), /忠於原文/);
  const prompts = [
    P.buildSystemPrompt("", P.DEFAULT_ENGLISH_OUTPUT_SPEC, "", "en"),
    P.buildChunkSystemPrompt("en")
  ].join("\n");
  assert.doesNotMatch(prompts, /British English/, "英文不可寫死英式拼寫");
  assert.match(prompts, /American or British/, "英文應依文章內容決定美式或英式");
}

async function main() {
  testEnglishChunkPathAndSpellingCarryNoChinese();
  testLanguageAndSpecNormalisation();
  testPromptLanguageAndChineseRegression();
  testAllBuildersCarryEnglishLanguageRules();
  testLanguageAwareValidation();
  testTopicOrganizerLanguageAwareValidation();
  await testTopicSnapshotsKeepTheirLanguageAfterConfigSwitch();
  await testConfigLanguageProfiles();
  await testAnalysisPipelineCarriesLanguage();
  await testRepairPipelineCarriesLanguage();
  console.log("output language tests passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
