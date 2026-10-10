"use strict";

// Service worker: constants, defaults, AppError, and runtime state.

// ==== Constants and defaults ====
const S = globalThis.AnalyzerShared;
const P = globalThis.AnalyzerPrompt;
const N = globalThis.AnalyzerNotion;
const G = globalThis.AnalyzerGemini;

const CONFIG_KEY = "notionAiAnalyzerConfig";
const STATE_KEY = "notionAiAnalyzerState";
const NOTION_TOKEN_KEY = "notionAiAnalyzerNotionToken";
const GEMINI_KEY_KEY = "notionAiAnalyzerGeminiKey";
const VERTEX_KEY_KEY = "notionAiAnalyzerVertexKey";
const PROCESS_ALARM = "notion-ai-analyzer-process";
const MAX_BLOCKS = 10000;
const MAX_RECENT = 40;
const MAX_FAILED_PAGES_TO_LOAD = 40;
const MAX_STORED_PAGE_TITLE_CHARACTERS = N.MAX_STORED_PAGE_TITLE_CHARACTERS;
// Hard cap after DIRECT_TEXT_LIMIT (180k) so long articles can use the
// chunk-notes pipeline. About ten CHUNK_TEXT_LIMIT (78k) pieces.
const MAX_ARTICLE_CHARACTERS = 780000;
const MAX_INPUT_TOKENS = 350000;
const TOKEN_PREFLIGHT_CHARACTERS = 80000;
const MAX_PENDING_PAGES = 2000;
const MAX_NOTION_DATA_SOURCES = 300;
const MAX_PERSISTED_STATE_BYTES = 4 * 1024 * 1024;
const TOPIC_ORGANIZER_CACHE_VERSION = 10;
const TOPIC_ORGANIZER_BATCH_LIMIT = G.TOPIC_ORGANIZER_BATCH_LIMIT;
// Conservative gap between page-level AI Studio calls (~5 RPM headroom).
const AI_STUDIO_PAGE_GAP_MS = 12000;
const DEFAULT_EXCLUDED_PERSON_TERMS = Object.freeze([]);
const REQUEUE_TIMEOUT_CODES = new Set([
  "AI_TIMEOUT",
  "PAGE_READ_TIMEOUT",
  "NOTION_WRITE_TIMEOUT"
]);
const RATE_LIMIT_CODES = new Set([
  "GEMINI_RATE_LIMIT",
  "VERTEX_RATE_LIMIT",
  "NOTION_RATE_LIMIT"
]);
const SETUP_ERROR_CODES = new Set([
  "GEMINI_AUTH",
  "GEMINI_KEY_MISSING",
  "VERTEX_AUTH",
  "VERTEX_KEY_MISSING",
  "MODEL_INVALID",
  "MODEL_NOT_FOUND",
  "SCHEMA_INVALID",
  "NOTION_FIELDS_INVALID",
  "NOTION_FIELDS_MISSING",
  "NOTION_AUTH",
  "NOTION_TOKEN_MISSING",
  "TOPIC_OPTIONS_EMPTY"
]);

const DEFAULT_CONFIG = Object.freeze({
  aiProvider: "gemini",
  allowTopicProposals: true,
  dataSourceId: "",
  databaseId: "",
  discardedTopicNames: [],
  excludedPersonTerms: DEFAULT_EXCLUDED_PERSON_TERMS,
  geminiModel: G.DEFAULT_MODEL,
  vertexModel: G.DEFAULT_MODEL,
  notionTarget: "",
  rememberGeminiKey: false,
  rememberVertexKey: false,
  rememberNotionToken: false,
  requestTimeoutMinutes: 5,
  outputLanguage: "zh-TW",
  englishOutputSpec: P.DEFAULT_ENGLISH_OUTPUT_SPEC,
  summaryInstructions: "",
  outputSpec: P.DEFAULT_OUTPUT_SPEC,
  preferExistingTopicsByDataSource: {},
  topicAliases: {},
  topicPageResolutions: {},
  topicDictionary: [],
  // The Notion column map of the active data source (see notion.js); null until its fields are prepared.
  columnMap: null,
  // Decides the names of columns and status options created in a data source that has none yet.
  uiLanguage: "zh",
  // What a connection test has proven. `ai` holds the provider and model that passed, so changing either voids it.
  verified: { notion: false, ai: "" }
});

const DEFAULT_STATE = Object.freeze({
  current: null,
  databaseCheck: null,
  failed: [],
  knownPending: null,
  lastError: "",
  lastScanAt: "",
  pendingScan: null,
  mode: "idle",
  paused: true,
  queue: [],
  recent: [],
  running: false,
  stopRequested: false,
  stage: null,
  topicOrganizer: null,
  topicRollback: null,
  topicReview: null
});

class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AppError";
    this.code = options.code || "APP_ERROR";
    this.diagnostic = options.diagnostic || null;
    this.status = options.status || 0;
    this.retryAfter = options.retryAfter || 0;
  }
}

// Stored in the saved state as written here; the popup translates it when it shows it.
const NO_PENDING_PAGES_MESSAGE = "目前沒有待分析文章。可在設定頁使用「準備待分析文章」批次選取，或在 Notion 將文章的整理狀態設為待分析。";

// Interface text in the language chosen on the options page; see i18n/index.js.
const t = AnalyzerI18n.t;

// ==== Shared guards ====
// One wording per condition, so every workflow reports it the same way.
function assertIdle() {
  if (stateCache?.running) throw new AppError(t("目前有其他工作正在進行，請先停止或等候完成"), { code: "BUSY" });
}

// Input the extension's own pages never send. The code tells the cases apart; the user only needs to reload.
function invalidRequest(code) {
  return new AppError(t("操作無效，請重新整理頁面後再試"), { code });
}

// ==== Runtime module state ====
let initializePromise = null;
let stateCache = null;
let activeAbortController = null;
let processingPromise = null;
let preparedDataSourceId = "";
let currentOutputLanguage = "zh-TW";
