/**
 * A fake `chrome` API with demo data, so popup.html and options.html render outside the extension.
 *
 * Injected by index.js ahead of the page's own scripts. Answers only the messages those two pages send while
 * a screenshot is taken; `?lang=zh|en` picks the language and `?scene=` the state to show. Never touches the
 * real background code, so the extension's behaviour is not part of what a screenshot depends on.
 */
"use strict";

(() => {
  const q = new URLSearchParams(location.search);
  const lang = q.get("lang") === "en" ? "en" : "zh";
  const scene = q.get("scene") || "popup";
  const en = lang === "en";
  const DB = "0123456789abcdef0123456789abcdef";
  const page = n => `https://www.notion.so/demo-${n}`;

  const titles = en
    ? ["How sourdough starters really work", "A quiet week in the Alps: trip notes", "Notes on typography for small screens", "Why we still read long articles"]
    : ["酸種麵包的酵母到底怎麼養", "阿爾卑斯山的安靜一週：旅行筆記", "給小螢幕的排版筆記", "為什麼我們還是愛讀長文"];
  const recent = titles.map((title, i) => ({ id: `p${i}`, title, url: page(i), outcome: "analyzed", analyzedAt: new Date(2026, 9, 9, 9 + i, 12).toISOString() }));

  const config = {
    uiLanguage: lang, outputLanguage: en ? "en" : "zh-TW", aiProvider: "gemini",
    notionTarget: DB, dataSourceId: DB, dataSourceTitle: en ? "Reading list" : "文章收藏",
    geminiModel: "gemini-2.5-flash", vertexModel: "gemini-2.5-flash", activeModel: "gemini-2.5-flash",
    hasNotionToken: true, hasGeminiKey: true, hasVertexKey: false, hasAiKey: true,
    rememberNotionToken: false, rememberGeminiKey: false, rememberVertexKey: false,
    excludedPersonTerms: [], summaryInstructions: "", requestTimeoutMinutes: 5,
    preferExistingTopics: false, preferExistingTopicsByDataSource: {},
    setup: { notion: "verified", ai: "verified", fields: "ready", databaseTitle: en ? "Reading list" : "文章收藏" }
  };
  // The setup scene shows a first-run state: Notion connected, the rest still to do.
  if (scene === "setup") {
    config.setup = { notion: "verified", ai: "saved", fields: "missing", databaseTitle: config.dataSourceTitle };
  }

  const status = {
    running: false, paused: false, queueCount: 0, mode: "", current: null, stage: null,
    knownPending: 3, failed: [], recent, lastError: "", topicReview: null,
    databaseCheck: { ready: true, code: "OK", message: "" }
  };
  if (scene === "review") {
    status.recent = recent.slice(0, 2);
    status.topicReview = {
      item: { id: "p0", title: titles[0], url: page(0) },
      candidate: en ? "Baking" : "烘焙",
      candidatePosition: 1, candidateTotal: 2,
      existingTopics: en ? ["Cooking"] : ["料理"],
      closestExisting: en ? ["Cooking", "Food"] : ["料理", "飲食"],
      topicOptions: (en ? ["Cooking", "Food", "Travel", "Design"] : ["料理", "飲食", "旅行", "設計"]).map(name => ({ name })),
      canDiscard: true
    };
  }

  const group = (id, topic, aliases, reason, impact, selected) => ({
    id, standardTopic: topic, aliases, selectedAliases: selected ? aliases : [], selected,
    confidence: "high", reason, impactCount: impact, keepSeparate: []
  });
  const groups = en ? [
    group("g1", "Cooking", ["Baking", "Sourdough", "Weeknight meals"], "All describe preparing food at home.", 6, true),
    group("g2", "Travel", ["Alps trip", "Hiking notes", "Travel planning"], "All relate to trips, routes and places visited.", 5, false),
    group("g3", "Design", ["Typography", "Small-screen layout"], "Both are about how text and layout are designed.", 4, false)
  ] : [
    group("g1", "料理", ["烘焙", "酸種麵包", "平日晚餐"], "皆與在家準備食物、料理方式相關。", 6, true),
    group("g2", "旅行", ["阿爾卑斯山", "登山筆記", "行程規劃"], "皆與旅程、路線與造訪地點相關。", 5, false),
    group("g3", "設計", ["排版", "小螢幕版面"], "皆與文字與版面的設計方式相關。", 4, false)
  ];
  const organizer = {
    status: "ready", scannedAt: new Date(2026, 9, 9, 9, 30).toISOString(), candidateCount: 14, occurrenceCount: 20,
    pageCount: 24, groups, unclassified: [], manualItems: [], existingTopics: [], appliedCount: 0,
    skippedCount: 0, warnings: [], progress: null, canRollback: false
  };

  const handlers = {
    GET_CONFIG: () => config,
    GET_STATUS: () => status,
    INSPECT_PAGE: () => ({ id: "p9", status: "pending", analyzed: false, title: titles[3] }),
    GET_TOPIC_ORGANIZER: () => organizer,
    LIST_UNANALYZED_ARTICLES: () => ({ articles: [], truncated: false }),
    LIST_MODELS: () => ({ models: [] }),
    OPEN_OPTIONS: () => ({})
  };

  window.chrome = {
    action: { openPopup: async () => {} },
    i18n: { getUILanguage: () => (en ? "en-US" : "zh-TW") },
    storage: {
      local: { get: async () => ({ notionAiAnalyzerConfig: { uiLanguage: lang } }), set: async () => {} },
      session: { get: async () => ({}), set: async () => {} }
    },
    tabs: { query: async () => [{ url: "https://www.notion.so/demo-article" }], create: async () => ({}) },
    runtime: {
      getManifest: () => ({ version: "1.1.0" }),
      sendMessage: async message => {
        const handler = handlers[message?.type];
        return handler ? { ok: true, data: handler(message) } : { ok: false, error: { message: `no mock for ${message?.type}` } };
      }
    }
  };
})();
