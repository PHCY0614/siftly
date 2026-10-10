"use strict";

// Interface text in the saved language; i18n/page.js has already translated the static page.
const { t, displayTitle } = globalThis.AnalyzerI18n;

// ==== DOM references and local UI state ====
const form = document.querySelector("#settings-form");
const pageStatus = document.querySelector("#page-status");
const analysisSettingsStatus = document.querySelector("#analysis-settings-status");
const credentialsStatus = document.querySelector("#credentials-status");
const notionToken = document.querySelector("#notion-token");
const notionTarget = document.querySelector("#notion-target");
const notionDataSourceSelect = document.querySelector("#notion-data-source");
const notionDataSourcePicker = document.querySelector("#notion-data-source-picker");
const notionDataSourceStatus = document.querySelector("#notion-data-source-status");
const loadNotionDataSourcesButton = document.querySelector("#load-notion-data-sources");
const databaseChangeWarning = document.querySelector("#database-change-warning");
const articlePreparation = document.querySelector("#article-preparation");
const articlePageSize = document.querySelector("#article-page-size");
const loadArticleCandidatesButton = document.querySelector("#load-article-candidates");
const loadMoreArticleCandidatesButton = document.querySelector("#load-more-article-candidates");
const articlePreparationSummary = document.querySelector("#article-preparation-summary");
const articleSelectionToolbar = document.querySelector("#article-selection-toolbar");
const selectAllArticles = document.querySelector("#select-all-articles");
const clearArticleSelectionButton = document.querySelector("#clear-article-selection");
const articleSelectedCount = document.querySelector("#article-selected-count");
const articleCandidateList = document.querySelector("#article-candidate-list");
const addArticlesToAnalysisButton = document.querySelector("#add-articles-to-analysis");
const markArticlesNoAnalysisButton = document.querySelector("#mark-articles-no-analysis");
const articlePreparationStatus = document.querySelector("#article-preparation-status");
const rememberNotionToken = document.querySelector("#remember-notion-token");
const aiProvider = document.querySelector("#ai-provider");
const geminiKey = document.querySelector("#gemini-key");
const geminiModel = document.querySelector("#gemini-model");
const rememberGeminiKey = document.querySelector("#remember-gemini-key");
const vertexKey = document.querySelector("#vertex-key");
const vertexModel = document.querySelector("#vertex-model");
const rememberVertexKey = document.querySelector("#remember-vertex-key");
const geminiSettings = document.querySelector("#gemini-settings");
const vertexSettings = document.querySelector("#vertex-settings");
const excludedPersonTerms = document.querySelector("#excluded-person-terms");
const titleMax = document.querySelector("#title-max");
const topicMin = document.querySelector("#topic-min");
const topicMax = document.querySelector("#topic-max");
const keywordCount = document.querySelector("#keyword-count");
const summaryMin = document.querySelector("#summary-min");
const summaryMax = document.querySelector("#summary-max");
const outputLanguage = document.querySelector("#output-language");
const outputSpecSummary = document.querySelector("#output-spec-summary");
const summaryInstructions = document.querySelector("#summary-instructions");
const summaryInstructionsStatus = document.querySelector("#summary-instructions-status");
const applySummaryInstructionsButton = document.querySelector("#apply-summary-instructions");
const resetSummaryInstructionsButton = document.querySelector("#reset-summary-instructions");
const requestTimeout = document.querySelector("#request-timeout");
const preferExistingTopics = document.querySelector("#prefer-existing-topics");
const organizerSummary = document.querySelector("#organizer-summary");
const organizerOperationStatus = document.querySelector("#organizer-operation-status");
const connectionStatus = document.querySelector("#connection-status");
const modelOperationStatus = document.querySelector("#model-operation-status");
const dictionaryStatus = document.querySelector("#dictionary-status");
const applyProgress = document.querySelector("#apply-progress");
const applyProgressFill = document.querySelector("#apply-progress-fill");
const applyProgressLabel = document.querySelector("#apply-progress-label");
const applyProgressTrack = applyProgress?.querySelector(".apply-progress__track");
const topicGroups = document.querySelector("#topic-groups");
const applyTopicsButton = document.querySelector("#apply-topics");
const unclassifiedPanel = document.querySelector("#unclassified-panel");
const unclassifiedSummary = document.querySelector("#unclassified-summary");
const unclassifiedTopics = document.querySelector("#unclassified-topics");
const manualTopicReview = document.querySelector("#manual-topic-review");
const manualTopicProgress = document.querySelector("#manual-topic-progress");
const manualTopicName = document.querySelector("#manual-topic-name");
const manualTopicImpact = document.querySelector("#manual-topic-impact");
const manualTopicNote = document.querySelector("#manual-topic-note");
const manualExistingTopic = document.querySelector("#manual-existing-topic");
const manualCustomTopic = document.querySelector("#manual-custom-topic");
const saveButton = document.querySelector("#save");
const connectNotionButtons = [...document.querySelectorAll("#connect-notion, #connect-notion-manual")];
const loadModelsButton = document.querySelector("#load-models");
const clearButton = document.querySelector("#clear-credentials");
const importDictionary = document.querySelector("#import-dictionary");
const importDictionaryTrigger = document.querySelector("#import-dictionary-trigger");
const importMode = document.querySelector("#import-mode");
const importModeDisplay = document.querySelector("#import-mode-display");
const importModeMenu = document.querySelector("#import-mode-menu");
const importModeToggle = document.querySelector("#import-mode-toggle");
const importSplitButton = document.querySelector("#import-split-btn");
const setupNextText = document.querySelector("#setup-next-text");
const setupNextAction = document.querySelector("#setup-next-action");
const fieldsStatus = document.querySelector("#fields-status");
const prepareFieldsButton = document.querySelector("#prepare-fields");
const uiLanguage = document.querySelector("#ui-language");
const fieldDetails = document.querySelector("#field-details");
const testAiButton = document.querySelector("#test-ai");
const notionSetupGuide = document.querySelector("#notion-setup-guide");
const enhancedSelects = new Map();
let organizerData = null;
let manualCandidateName = "";
let topicOrganizerPreferences = {};
let savedNotionTarget = "";
let savedDataSourceId = "";
let savedSummaryInstructions = "";
let currentOutputLanguage = "zh-TW";
let outputSpecs = {
  "zh-TW": null,
  en: null
};
let summaryInstructionsLoaded = false;
let summaryInstructionsBusy = false;
let settingsBusy = false;
let notionDataSourcesLoaded = false;
let notionDataSourcesLoading = false;
let articlePages = [];
let articleSelectedIds = new Set();
let articleNextCursor = "";
let articleHasMore = false;
let articleListLoaded = false;
let articleListBusy = false;
let articleActionBusy = false;
let articleDataSourceId = "";
let articlePreparationGeneration = 0;
const MAX_ARTICLE_CANDIDATES = 2000;
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// ==== Shared custom select ====
function closeEnhancedSelects(except = null) {
  for (const controller of enhancedSelects.values()) {
    if (controller !== except) controller.close();
  }
}

/**
 * Options wrapper around AnalyzerSelect. Model, timeout, and manual-topic ids
 * get custom-select--regular;
 * all use matchNativeState, emptyLabel 「請選擇」, and onToggle to close other
 * enhanced menus. Document close/Escape is handled on this page, so
 * attachDocumentListeners is false. Extra native change → sync.
 */
function enhanceSelect(select) {
  if (!select || enhancedSelects.has(select)) return enhancedSelects.get(select);
  const extraRootClass = select.id === "ui-language"
    ? "custom-select--compact"
    : ["gemini-model", "vertex-model", "request-timeout", "manual-existing-topic"]
      .includes(select.id) ? "custom-select--regular" : "";
  const controller = AnalyzerSelect.enhance(select, {
    extraRootClass,
    emptyLabel: t("請選擇"),
    matchNativeState: true,
    attachDocumentListeners: false,
    onToggle(controller, opening) {
      closeEnhancedSelects(opening ? controller : null);
    }
  });
  enhancedSelects.set(select, controller);
  select.addEventListener("change", () => controller.sync());
  return controller;
}

function syncEnhancedSelects() {
  for (const controller of enhancedSelects.values()) controller.sync();
}

// Set before the select is enhanced, so its custom trigger starts on the current language.
uiLanguage.value = globalThis.AnalyzerI18n.getLanguage();
for (const select of [
  uiLanguage,
  aiProvider,
  notionDataSourceSelect,
  geminiModel,
  vertexModel,
  requestTimeout,
  manualExistingTopic,
  outputLanguage
]) enhanceSelect(select);

const DEFAULT_OUTPUT_SPECS = Object.freeze({
  "zh-TW": Object.freeze({
    titleMax: 12,
    topicMin: 1,
    topicMax: 3,
    keywordCount: 5,
    summaryMin: 100,
    summaryMax: 250
  }),
  en: Object.freeze({
    titleMax: 10,
    topicMin: 1,
    topicMax: 3,
    keywordCount: 5,
    summaryMin: 80,
    summaryMax: 150
  })
});
const OUTPUT_SPEC_LIMITS_BY_LANGUAGE = Object.freeze({
  "zh-TW": Object.freeze({
    titleMax: Object.freeze({ input: titleMax, min: 6, max: 30 }),
    topicMin: Object.freeze({ input: topicMin, min: 1, max: 5 }),
    topicMax: Object.freeze({ input: topicMax, min: 1, max: 5 }),
    keywordCount: Object.freeze({ input: keywordCount, min: 3, max: 10 }),
    summaryMin: Object.freeze({ input: summaryMin, min: 50, max: 500 }),
    summaryMax: Object.freeze({ input: summaryMax, min: 100, max: 800 })
  }),
  en: Object.freeze({
    titleMax: Object.freeze({ input: titleMax, min: 4, max: 20 }),
    topicMin: Object.freeze({ input: topicMin, min: 1, max: 5 }),
    topicMax: Object.freeze({ input: topicMax, min: 1, max: 5 }),
    keywordCount: Object.freeze({ input: keywordCount, min: 3, max: 10 }),
    summaryMin: Object.freeze({ input: summaryMin, min: 30, max: 300 }),
    summaryMax: Object.freeze({ input: summaryMax, min: 50, max: 800 })
  })
});
let DEFAULT_OUTPUT_SPEC = DEFAULT_OUTPUT_SPECS["zh-TW"];
let OUTPUT_SPEC_LIMITS = OUTPUT_SPEC_LIMITS_BY_LANGUAGE["zh-TW"];

/*
 * The two specs are drafts in this page. The background keeps outputSpec as
 * the Traditional Chinese spec and englishOutputSpec as the English spec;
 * switching language only changes which draft is visible.
 */
function normalizedOutputLanguage(value) {
  return value === "en" ? "en" : "zh-TW";
}

function outputLanguageLabel(language = currentOutputLanguage) {
  return normalizedOutputLanguage(language) === "en" ? t("英文") : t("正體中文");
}

function specLimitsForLanguage(language = currentOutputLanguage) {
  return OUTPUT_SPEC_LIMITS_BY_LANGUAGE[normalizedOutputLanguage(language)];
}

function normalizeOutputSpecValue(value, language = currentOutputLanguage) {
  const normalizedLanguage = normalizedOutputLanguage(language);
  const defaults = DEFAULT_OUTPUT_SPECS[normalizedLanguage];
  const limits = specLimitsForLanguage(normalizedLanguage);
  const result = {};
  for (const [key, limit] of Object.entries(limits)) {
    const parsed = Number(value?.[key]);
    result[key] = Number.isFinite(parsed)
      ? Math.max(limit.min, Math.min(limit.max, Math.round(parsed)))
      : defaults[key];
  }
  return result;
}

function setVisibleOutputSpec(spec, language = currentOutputLanguage) {
  const normalizedLanguage = normalizedOutputLanguage(language);
  currentOutputLanguage = normalizedLanguage;
  DEFAULT_OUTPUT_SPEC = DEFAULT_OUTPUT_SPECS[normalizedLanguage];
  OUTPUT_SPEC_LIMITS = specLimitsForLanguage(normalizedLanguage);
  const normalized = normalizeOutputSpecValue(spec, normalizedLanguage);
  for (const [key, limit] of Object.entries(OUTPUT_SPEC_LIMITS)) {
    limit.input.min = String(limit.min);
    limit.input.max = String(limit.max);
    limit.input.value = String(normalized[key]);
  }
  updateOutputSpecSummary();
  updateTopicLanguageUi(
    organizerData ? topicSnapshotOutputLanguage(organizerData, "zh-TW") : currentOutputLanguage
  );
  updateOutputSpecLanguageUi();
}

function saveVisibleOutputSpecDraft() {
  outputSpecs[currentOutputLanguage] = normalizeFormOutputSpec(true);
  return outputSpecs[currentOutputLanguage];
}

function switchOutputLanguage(language) {
  const nextLanguage = normalizedOutputLanguage(language);
  saveVisibleOutputSpecDraft();
  currentOutputLanguage = nextLanguage;
  setVisibleOutputSpec(outputSpecs[nextLanguage] || DEFAULT_OUTPUT_SPECS[nextLanguage], nextLanguage);
}

function currentOutputSpec() {
  return normalizeFormOutputSpec(false);
}

function updateTopicLanguageUi(language = currentOutputLanguage) {
  const english = normalizedOutputLanguage(language) === "en";
  const maxLength = english ? "100" : "6";
  for (const input of [manualCustomTopic]) {
    if (!input) continue;
    input.maxLength = Number(maxLength);
  }
  for (const input of document.querySelectorAll(".topic-group input[type=\"text\"]")) {
    input.maxLength = Number(maxLength);
    input.setAttribute("aria-label", english ? t("標準主題名稱（英文）") : t("標準主題名稱"));
  }
  const manualHint = document.querySelector("#manual-custom-topic-hint");
  if (manualHint) {
    manualHint.textContent = english
      ? t("英文自訂主題最多 60 個字元，建議使用 1～3 個單字。")
      : t("自訂主題最多 6 字，建議使用 2～4 字。");
  }
}

function updateOutputSpecLanguageUi() {
  const limits = specLimitsForLanguage();
  const range = (key, unit) => t("{min}～{max} {unit}", { min: limits[key].min, max: limits[key].max, unit });
  const length = outputSpecUnit();
  const labels = {
    "title-max-label": t("標題上限（{range}）", { range: range("titleMax", length) }),
    "topic-min-label": t("主題最少（{range}）", { range: range("topicMin", t("個")) }),
    "topic-max-label": t("主題最多（{range}）", { range: range("topicMax", t("個")) }),
    "keyword-count-label": t("關鍵字數量（{range}）", { range: range("keywordCount", t("個")) }),
    "summary-min-label": t("摘要最少（{range}）", { range: range("summaryMin", length) }),
    "summary-max-label": t("摘要最多（{range}）", { range: range("summaryMax", length) })
  };
  for (const [id, text] of Object.entries(labels)) {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = text;
  }
}

function outputSpecUnit(language = currentOutputLanguage) {
  return normalizedOutputLanguage(language) === "en" ? t("單字") : t("字");
}

function outputSpecSummaryText(spec, language = currentOutputLanguage) {
  const unit = outputSpecUnit(language);
  return t("目前分析規格：標題最多 {titleMax} {unit}｜主題 {topicMin}～{topicMax} 個｜關鍵字 {keywordCount} 個｜摘要 {summaryMin}～{summaryMax} {unit}", {
    titleMax: spec.titleMax,
    unit,
    topicMin: spec.topicMin,
    topicMax: spec.topicMax,
    keywordCount: spec.keywordCount,
    summaryMin: spec.summaryMin,
    summaryMax: spec.summaryMax
  });
}

function clampOutputValue(key, value) {
  const limit = OUTPUT_SPEC_LIMITS[key];
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_OUTPUT_SPEC[key];
  return Math.max(limit.min, Math.min(limit.max, Math.round(parsed)));
}

function normalizeFormOutputSpec(writeBack = false) {
  const spec = {};
  for (const [key, limit] of Object.entries(OUTPUT_SPEC_LIMITS)) {
    spec[key] = clampOutputValue(key, limit.input.value);
    if (writeBack) limit.input.value = String(spec[key]);
  }
  return spec;
}

// ==== Background messaging ====
/**
 * chrome.runtime.sendMessage wrapper. Throws on ok false. Settings UI uses
 * GET_CONFIG / SAVE_SETTINGS; the Notion picker uses
 * LIST_NOTION_DATA_SOURCES; organizer UI uses GET_TOPIC_ORGANIZER and
 * apply/skip/rollback/manual messages. Does not poll or persist picker data.
 */
async function send(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response?.ok) {
    const error = new Error(response?.error?.message || t("操作失敗"));
    error.code = response?.error?.code || "UNEXPECTED";
    throw error;
  }
  return response.data;
}

// Each message appears once: beside the control that caused it, or, without a target, in the setup
// summary at the top (page-wide messages and results of steps whose section collapses when they succeed).
function showStatus(message, kind = "info", target = pageStatus) {
  target.textContent = message;
  target.className = `local-status visible ${kind}`;
}

function clearStatus(target) {
  target.textContent = "";
  target.className = "local-status";
}

function articleSavedDataSourceId() {
  return savedDataSourceId || compactTargetId(savedNotionTarget);
}

function articleTargetIsSaved() {
  const current = compactTargetId(notionTarget.value);
  return Boolean(current && savedTargetIds().includes(current));
}

function setArticlePreparationStatus(message, kind = "") {
  articlePreparationStatus.textContent = message;
  articlePreparationStatus.className = `hint article-preparation-status${kind ? ` ${kind}` : ""}`;
}

function renderArticleCandidates() {
  articleCandidateList.replaceChildren(...articlePages.map(page => {
    const row = document.createElement("article");
    row.className = "article-candidate";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = articleSelectedIds.has(page.id);
    checkbox.disabled = settingsBusy || articleListBusy || articleActionBusy;
    checkbox.setAttribute("aria-label", t("選取文章：{title}", { title: displayTitle(page.title) || t("未命名文章") }));
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) articleSelectedIds.add(page.id);
      else articleSelectedIds.delete(page.id);
      updateArticlePreparationUi();
    });

    const content = document.createElement("div");
    content.className = "article-candidate__content";
    const title = document.createElement("div");
    title.className = "article-candidate__title";
    const safeUrl = safeNotionUrl(page.url);
    if (safeUrl) {
      const link = document.createElement("a");
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = displayTitle(page.title) || t("未命名文章");
      title.append(link);
    } else {
      title.textContent = displayTitle(page.title) || t("未命名文章");
    }
    const preview = document.createElement("p");
    preview.className = "article-candidate__preview";
    preview.textContent = page.previewUnavailable
      ? t("預覽目前無法載入")
      : (page.preview || t("目前沒有預覽文字"));
    content.append(title, preview);
    row.append(checkbox, content);
    return row;
  }));

  articleSelectionToolbar.hidden = articlePages.length === 0;
  articleCandidateList.classList.toggle("article-candidate-list--empty", articlePages.length === 0);
  loadMoreArticleCandidatesButton.hidden = !articleHasMore;
  updateArticlePreparationUi();
}

function safeNotionUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowedHost = host === "notion.so"
      || host.endsWith(".notion.so")
      || host === "notion.site"
      || host.endsWith(".notion.site");
    return url.protocol === "https:" && allowedHost ? url.href : "";
  } catch {
    return "";
  }
}

function updateArticlePreparationUi() {
  const busy = settingsBusy || articleListBusy || articleActionBusy;
  const hasSavedTarget = articleTargetIsSaved();
  const selectedCount = articleSelectedIds.size;
  articlePageSize.disabled = busy;
  loadArticleCandidatesButton.disabled = busy || !hasSavedTarget;
  loadMoreArticleCandidatesButton.disabled = busy || !hasSavedTarget || !articleHasMore;
  selectAllArticles.disabled = busy || articlePages.length === 0;
  clearArticleSelectionButton.disabled = busy || selectedCount === 0;
  addArticlesToAnalysisButton.disabled = busy || selectedCount === 0 || !hasSavedTarget;
  markArticlesNoAnalysisButton.disabled = busy || selectedCount === 0 || !hasSavedTarget;
  articleSelectedCount.textContent = t("已選 {selectedCount} 篇", { selectedCount });
  const loadedCount = articlePages.length;
  selectAllArticles.checked = loadedCount > 0 && selectedCount === loadedCount;
  selectAllArticles.indeterminate = selectedCount > 0 && selectedCount < loadedCount;

  if (!hasSavedTarget && articlePreparation.open && !busy) {
    setArticlePreparationStatus(t("請先按「連接資料庫」。"), "error");
  }
}

function clearArticleCandidates(message = "") {
  articlePreparationGeneration += 1;
  articlePages = [];
  articleSelectedIds = new Set();
  articleNextCursor = "";
  articleHasMore = false;
  articleListLoaded = false;
  articleDataSourceId = "";
  articlePreparationSummary.textContent = "";
  setArticlePreparationStatus(message);
  renderArticleCandidates();
}

function updateArticlePreparationSummary() {
  articlePreparationSummary.textContent = articlePages.length
    ? t("已載入 {count} 篇尚未整理文章{limitNote}。", {
      count: articlePages.length,
      limitNote: articlePages.length >= MAX_ARTICLE_CANDIDATES ? t("（已達上限）") : ""
    })
    : t("目前找不到尚未整理的文章。");
}

function normalizeArticlePages(pages) {
  return (Array.isArray(pages) ? pages : []).filter(page => page && typeof page.id === "string" && page.id.trim());
}

async function requestArticleCandidates(payload, generation) {
  if (generation !== articlePreparationGeneration) return null;
  return send("LIST_UNANALYZED_ARTICLES", payload);
}

async function loadArticleCandidates(reset = false) {
  if (articleListBusy || articleActionBusy) return;
  if (!articleTargetIsSaved()) {
    setArticlePreparationStatus(t("請先按「連接資料庫」。"), "error");
    return;
  }
  if (!reset && !articleHasMore) return;
  if (reset) clearArticleCandidates(t("載入中…"));

  const generation = articlePreparationGeneration;
  const pageSize = Number(articlePageSize.value) === 50 ? 50 : 10;
  const cursor = reset ? "" : articleNextCursor;
  const payload = { pageSize };
  if (cursor) {
    payload.cursor = cursor;
    payload.dataSourceId = articleDataSourceId || articleSavedDataSourceId();
  }
  articleListBusy = true;
  setBusy(true);
  if (!reset) setArticlePreparationStatus(t("載入中…"));
  try {
    const result = await requestArticleCandidates(payload, generation);
    if (!result || generation !== articlePreparationGeneration || !articleTargetIsSaved()) return;
    const incoming = normalizeArticlePages(result.pages);
    const existingIds = new Set(articlePages.map(page => page.id));
    const added = incoming.filter(page => !existingIds.has(page.id));
    const wasEmpty = articlePages.length === 0;
    articlePages.push(...added.slice(0, Math.max(0, MAX_ARTICLE_CANDIDATES - articlePages.length)));
    if (reset && wasEmpty) {
      for (const page of articlePages.slice(0, 10)) articleSelectedIds.add(page.id);
    }
    articleDataSourceId = result.dataSourceId || articleDataSourceId || articleSavedDataSourceId();
    articleNextCursor = result.nextCursor || "";
    articleHasMore = Boolean(result.hasMore) && articlePages.length < MAX_ARTICLE_CANDIDATES;
    articleListLoaded = true;
    updateArticlePreparationSummary();
    setArticlePreparationStatus(articlePages.length ? t("請選取要處理的文章。") : t("目前沒有可選取的文章。"));
    renderArticleCandidates();
  } catch (error) {
    if (generation === articlePreparationGeneration) {
      setArticlePreparationStatus(error.message, "error");
    }
  } finally {
    articleListBusy = false;
    setBusy(false);
    if (generation === articlePreparationGeneration) {
      renderArticleCandidates();
    } else {
      updateArticlePreparationUi();
    }
  }
}

function selectedArticlePages() {
  return articlePages.filter(page => articleSelectedIds.has(page.id));
}

async function setSelectedArticleStatus(status) {
  if (articleListBusy || articleActionBusy) return;
  if (!articleTargetIsSaved()) {
    setArticlePreparationStatus(t("請先按「連接資料庫」。"), "error");
    return;
  }
  const selected = selectedArticlePages();
  if (!selected.length) return;
  const generation = articlePreparationGeneration;
  const dataSourceId = articleDataSourceId || articleSavedDataSourceId();
  if (!dataSourceId) {
    setArticlePreparationStatus(t("請先按「連接資料庫」。"), "error");
    return;
  }
  articleActionBusy = true;
  setBusy(true);
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  try {
    for (let start = 0; start < selected.length; start += 50) {
      if (generation !== articlePreparationGeneration) return;
      const chunk = selected.slice(start, start + 50);
      setArticlePreparationStatus(t("正在處理文章 {value}／{selectedCount}…", { value: Math.min(start + chunk.length, selected.length), selectedCount: selected.length }));
      const result = await send("SET_ARTICLE_ANALYSIS_STATUS", {
        dataSourceId: articleDataSourceId || dataSourceId,
        pageIds: chunk.map(page => page.id),
        status
      });
      if (generation !== articlePreparationGeneration || !articleTargetIsSaved()) return;
      articleDataSourceId = result.dataSourceId || articleDataSourceId || dataSourceId;
      const updatedIds = Array.isArray(result.updatedIds) ? result.updatedIds : [];
      const skippedIds = Array.isArray(result.skipped)
        ? result.skipped.map(item => item?.id).filter(Boolean)
        : [];
      updated += updatedIds.length;
      skipped += skippedIds.length;
      const removedIds = new Set([...updatedIds, ...skippedIds]);
      articlePages = articlePages.filter(page => {
        if (!removedIds.has(page.id)) return true;
        articleSelectedIds.delete(page.id);
        return false;
      });
      updateArticlePreparationSummary();
      failed += Array.isArray(result.failed) ? result.failed.length : 0;
      processed += chunk.length;
      renderArticleCandidates();
    }
    const actionName = status === "pending" ? t("已加入待分析") : t("已標記不分析");
    const resultParts = [t("{actionName} {updated} 篇", { actionName, updated })];
    if (skipped) resultParts.push(t("略過 {skipped} 篇", { skipped }));
    if (failed) resultParts.push(t("失敗 {failed} 篇", { failed }));
    setArticlePreparationStatus(`${resultParts.join(t("，"))}${t("。")}${failed ? t("失敗項目仍保留勾選，可重試。") : ""}`);
  } catch (error) {
    if (generation === articlePreparationGeneration) {
      setArticlePreparationStatus(processed
        ? t("已處理 {processed} 篇，後續處理失敗：{message}", { processed, message: error.message })
        : error.message, "error");
    }
  } finally {
    articleActionBusy = false;
    setBusy(false);
    if (generation === articlePreparationGeneration) {
      renderArticleCandidates();
    } else {
      updateArticlePreparationUi();
    }
  }
}

function closeImportModeMenu() {
  importModeMenu.hidden = true;
  importModeToggle.setAttribute("aria-expanded", "false");
}

function setImportMode(value) {
  const normalized = value === "overwrite" ? "overwrite" : "merge";
  importMode.value = normalized;
  importModeDisplay.textContent = normalized === "overwrite" ? t("取代") : t("合併");
  for (const option of importModeMenu.querySelectorAll(".split-btn__option")) {
    const selected = option.dataset.value === normalized;
    option.setAttribute("aria-selected", String(selected));
    option.querySelector(".split-btn__check")?.classList.toggle("split-btn__check--empty", !selected);
  }
  closeImportModeMenu();
}

function settingsFromForm() {
  saveVisibleOutputSpecDraft();
  return {
    aiProvider: aiProvider.value,
    geminiKey: geminiKey.value.trim(),
    geminiModel: geminiModel.value.trim(),
    vertexKey: vertexKey.value.trim(),
    vertexModel: vertexModel.value.trim(),
    excludedPersonTerms: excludedPersonTerms.value,
    preferExistingTopics: preferExistingTopics.checked,
    outputSpec: normalizeOutputSpecValue(outputSpecs["zh-TW"], "zh-TW"),
    englishOutputSpec: normalizeOutputSpecValue(outputSpecs.en, "en"),
    outputLanguage: currentOutputLanguage,
    summaryInstructions: savedSummaryInstructions,
    requestTimeoutMinutes: Number(requestTimeout.value),
    notionTarget: notionTarget.value.trim(),
    notionToken: notionToken.value.trim(),
    rememberGeminiKey: rememberGeminiKey.checked,
    rememberVertexKey: rememberVertexKey.checked,
    rememberNotionToken: rememberNotionToken.checked
  };
}

// ==== AI provider and model discovery ====
/**
 * Returns the model <select> for the currently chosen provider. Sends no
 * messages. Does not change values; provider tests and AI calls stay in
 * background.js.
 */
function activeModelElement() {
  if (aiProvider.value === "vertex") return vertexModel;
  return geminiModel;
}

/**
 * Shows the selected provider's key/model fields and hides the others, then
 * syncs enhanced selects. Sends no messages. Updates Gemini/Vertex settings
 * and model-select hidden state, the
 * load-models button label. LIST_MODELS is sent by the
 * scan/load-models button. Provider tests and AI calls stay in background.js.
 */
function updateProviderUi() {
  const provider = aiProvider.value;
  geminiSettings.hidden = provider !== "gemini";
  vertexSettings.hidden = provider !== "vertex";
  geminiModel.hidden = provider !== "gemini";
  vertexModel.hidden = provider !== "vertex";
  loadModelsButton.textContent = provider === "vertex" ? t("載入建議模型") : t("掃描可用模型");
  syncEnhancedSelects();
}

function setBusy(isBusy) {
  settingsBusy = isBusy;
  // A new action starts: the summary's last result no longer describes what is happening.
  if (isBusy) clearStatus(pageStatus);
  for (const button of [
    saveButton,
    ...connectNotionButtons,
    loadModelsButton,
    loadNotionDataSourcesButton,
    clearButton,
    prepareFieldsButton,
    testAiButton,
    setupNextAction
  ]) button.disabled = isBusy;
  updateSummaryInstructionsStatus();
  updateArticlePreparationUi();
}

function formatTokenLimit(value) {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function modelLabel(model, recommendedName) {
  const limits = [
    Number.isFinite(model.inputTokenLimit) ? t("輸入 {value}", { value: formatTokenLimit(model.inputTokenLimit) }) : "",
    Number.isFinite(model.outputTokenLimit) ? t("輸出 {value}", { value: formatTokenLimit(model.outputTokenLimit) }) : ""
  ].filter(Boolean).join("／");
  const recommended = model.name === recommendedName ? t("｜建議") : "";
  const display = model.displayName && model.displayName !== model.name
    ? `${model.displayName}｜${model.name}`
    : model.name;
  return `${display}${recommended}${limits ? `｜${limits}` : ""}`;
}

/**
 * Ensures a stored model name exists as an option before loadConfig assigns
 * select.value. Sends no messages. Appends one option onto the given model
 * select when missing. Does not call LIST_MODELS; provider tests, schema, and
 * AI calls stay in background.js.
 */
function ensureModelOption(select, name, label = name) {
  if ([...select.options].some(option => option.value === name)) return;
  const option = document.createElement("option");
  option.value = name;
  option.textContent = label;
  select.append(option);
}

/**
 * Replaces one model <select> from a LIST_MODELS result array and syncs its
 * AnalyzerSelect. Sends no messages. Rebuilds options, marks 「建議」 on the
 * first priority model that actually appears in the live list, then selects
 * the previous value if still present, else that recommended model, else
 * the first model. Does not keep a missing stored id as an option.
 * The load-models click handler is what sends LIST_MODELS after SAVE_SETTINGS.
 * Provider tests, schema, and AI calls stay in background.js.
 */
function renderModels(select, models, selected, recommendedName) {
  const recommended = recommendedName
    || models.find(model => model.name === DEFAULT_MODEL)?.name
    || models[0]?.name
    || "";
  const options = models.map(model => {
    const option = document.createElement("option");
    option.value = model.name;
    option.textContent = modelLabel(model, recommended);
    return option;
  });
  select.replaceChildren(...options);
  if (models.some(model => model.name === selected)) {
    select.value = selected;
  } else if (models.some(model => model.name === recommended)) {
    select.value = recommended;
  } else if (models[0]) {
    select.value = models[0].name;
  }
  enhancedSelects.get(select)?.sync();
}

// ==== Settings form ====
function shortNotionId(value) {
  return compactTargetId(value).slice(0, 8);
}

function savedTargetIds() {
  return [savedNotionTarget, savedDataSourceId].map(compactTargetId).filter(Boolean);
}

function updateDatabaseChangeWarning() {
  const nextId = compactTargetId(notionTarget.value);
  const currentIds = savedTargetIds();
  const changed = nextId ? !currentIds.includes(nextId) : currentIds.length > 0;
  databaseChangeWarning.hidden = !changed;
}

function showNotionDataSourceStatus(message, kind = "info") {
  notionDataSourceStatus.textContent = message;
  notionDataSourceStatus.className = message ? `notion-source-status visible ${kind}` : "notion-source-status";
}

function dataSourceOptionLabel(dataSource, duplicateTitles) {
  const titleKey = dataSource.title.toLocaleLowerCase("zh-Hant-TW");
  const duplicateSuffix = duplicateTitles.get(titleKey) > 1 ? ` · ${shortNotionId(dataSource.id)}` : "";
  return `${dataSource.emoji ? `${dataSource.emoji} ` : ""}${displayTitle(dataSource.title)}${duplicateSuffix}`;
}

function renderNotionDataSources(dataSources, limitReached) {
  const sources = Array.isArray(dataSources) ? dataSources : [];
  const duplicateTitles = new Map();
  for (const source of sources) {
    const key = source.title.toLocaleLowerCase("zh-Hant-TW");
    duplicateTitles.set(key, (duplicateTitles.get(key) || 0) + 1);
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("請選擇資料庫");
  placeholder.disabled = true;
  const options = sources.map(source => {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = dataSourceOptionLabel(source, duplicateTitles);
    return option;
  });
  notionDataSourceSelect.replaceChildren(placeholder, ...options);

  const inputTarget = notionTarget.value.trim();
  const inputId = compactTargetId(inputTarget);
  const currentIds = [inputId, compactTargetId(savedDataSourceId)].filter(Boolean);
  const matched = sources.find(source => currentIds.includes(compactTargetId(source.id)));
  if (matched) {
    notionDataSourceSelect.value = matched.id;
  } else if (inputTarget) {
    const current = document.createElement("option");
    current.value = inputTarget;
    current.textContent = inputId && savedTargetIds().includes(inputId)
      ? t("目前設定（未出現在載入結果中）")
      : t("目前輸入（未出現在載入結果中）");
    notionDataSourceSelect.append(current);
    notionDataSourceSelect.value = inputTarget;
  } else {
    notionDataSourceSelect.value = "";
  }
  enhancedSelects.get(notionDataSourceSelect)?.sync();

  notionDataSourcePicker.hidden = !sources.length && !inputTarget;
  if (sources.length) {
    const limitNote = limitReached ? t(" 已達 300 筆上限；其餘資料庫可使用重新整理或進階手動輸入。") : "";
    showNotionDataSourceStatus(t("已載入 {sourcesCount} 個可用 Data Source。{limitNote}", { sourcesCount: sources.length, limitNote }), "success");
  } else {
    showNotionDataSourceStatus(
      t("找不到已分享給這個 Integration 的資料庫。請先在 Notion 加入連線，再重新整理。"),
      "info"
    );
  }
}

/**
 * SAVE_SETTINGS from the form. Local guards for empty target/model and
 * output-spec ranges run first. Secrets are not
 * written back into the inputs; placeholders show has*Key. Does not test
 * any connection or read the Notion schema.
 */
// requireNotionTarget is false for steps that do not touch Notion, such as testing the AI service.
async function saveSettings(showConfirmation = true, requireNotionTarget = true) {
  if (requireNotionTarget && !notionTarget.value.trim()) {
    throw new Error(t("請先選擇 Notion 資料庫，或在進階設定輸入資料庫網址或 Data Source ID"));
  }
  if (!activeModelElement().value.trim()) throw new Error(t("請選擇分析模型"));
  const outputSpec = normalizeFormOutputSpec(true);
  updateOutputSpecSummary();
  if (outputSpec.topicMin > outputSpec.topicMax) throw new Error(t("主題最少數不可大於主題最多數"));
  if (outputSpec.summaryMin > outputSpec.summaryMax) throw new Error(t("摘要最少字數不可大於摘要最多字數"));
  const config = await send("SAVE_SETTINGS", { settings: settingsFromForm() });
  topicOrganizerPreferences = config.preferExistingTopicsByDataSource ?? topicOrganizerPreferences;
  preferExistingTopics.checked = Boolean(config.preferExistingTopics);
  savedNotionTarget = config.notionTarget || "";
  savedDataSourceId = config.dataSourceId || "";
  updateDatabaseChangeWarning();
  renderSetup(config.setup);
  notionToken.value = "";
  geminiKey.value = "";
  vertexKey.value = "";
  notionToken.placeholder = config.hasNotionToken ? t("已設定（留白會保留）") : "secret_…";
  geminiKey.placeholder = config.hasGeminiKey ? t("已設定（留白會保留）") : "AIza…";
  vertexKey.placeholder = config.hasVertexKey ? t("已設定（留白會保留）") : "AIza…";
  if (config.databaseChanged) {
    organizerClearedForPendingDbChange = false;
    organizerData = await send("GET_TOPIC_ORGANIZER");
    renderOrganizer();
    clearArticleCandidates(t("資料庫已切換，請重新載入文章清單。"));
  } else {
    organizerClearedForPendingDbChange = false;
    updateArticlePreparationUi();
  }
  if (showConfirmation) {
    const queueNotice = config.databaseChanged
      ? t(" 已切換資料庫，舊資料庫的佇列與整理建議已清除。")
      : "";
    const summaryDraftNotice = summaryInstructionsLoaded
      && summaryInstructions.value.trim() !== savedSummaryInstructions
      ? t(" 摘要指引有未套用草稿，請按「套用」後才會保存。")
      : "";
    showStatus(`${t("設定已儲存。")}${queueNotice}${summaryDraftNotice}`, "success", analysisSettingsStatus);
  }
  return config;
}

/**
 * GET_CONFIG into the form, then GET_TOPIC_ORGANIZER and renderOrganizer.
 * Secret values are not returned; placeholders show whether keys exist.
 */
async function loadConfig() {
  try {
    const config = await send("GET_CONFIG");
    aiProvider.value = config.aiProvider || "gemini";
    savedNotionTarget = config.notionTarget || "";
    savedDataSourceId = config.dataSourceId || "";
    notionTarget.value = config.notionTarget || config.dataSourceId || "";
    const selectedModel = config.geminiModel || DEFAULT_MODEL;
    ensureModelOption(geminiModel, selectedModel);
    geminiModel.value = selectedModel;
    const selectedVertexModel = config.vertexModel || DEFAULT_MODEL;
    ensureModelOption(vertexModel, selectedVertexModel);
    vertexModel.value = selectedVertexModel;
    rememberNotionToken.checked = Boolean(config.rememberNotionToken);
    rememberGeminiKey.checked = Boolean(config.rememberGeminiKey);
    rememberVertexKey.checked = Boolean(config.rememberVertexKey);
    excludedPersonTerms.value = (config.excludedPersonTerms ?? []).join("\n");
    outputSpecs = {
      "zh-TW": normalizeOutputSpecValue(config.outputSpec, "zh-TW"),
      en: normalizeOutputSpecValue(config.englishOutputSpec, "en")
    };
    currentOutputLanguage = normalizedOutputLanguage(config.outputLanguage);
    outputLanguage.value = currentOutputLanguage;
    setVisibleOutputSpec(outputSpecs[currentOutputLanguage], currentOutputLanguage);
    savedSummaryInstructions = config.summaryInstructions || "";
    summaryInstructions.value = savedSummaryInstructions;
    summaryInstructionsLoaded = true;
    updateSummaryInstructionsStatus();
    requestTimeout.value = String(config.requestTimeoutMinutes ?? 5);
    topicOrganizerPreferences = config.preferExistingTopicsByDataSource ?? {};
    preferExistingTopics.checked = Boolean(config.preferExistingTopics);
    notionToken.placeholder = config.hasNotionToken ? t("已設定（留白會保留）") : "secret_…";
    geminiKey.placeholder = config.hasGeminiKey ? t("已設定（留白會保留）") : "AIza…";
    vertexKey.placeholder = config.hasVertexKey ? t("已設定（留白會保留）") : "AIza…";
    updateProviderUi();
    syncEnhancedSelects();
    updateDatabaseChangeWarning();
    updateArticlePreparationUi();
    renderSetup(config.setup);
    organizerData = await send("GET_TOPIC_ORGANIZER");
    renderOrganizer();
    if (articlePreparation.open && articleTargetIsSaved()) void loadArticleCandidates(true);
  } catch (error) {
    showStatus(error.message, "error");
  }
}

function compactTargetId(value) {
  const compact = String(value ?? "").replaceAll("-", "");
  return compact.match(/[0-9a-f]{32}/i)?.[0]?.toLowerCase() || "";
}

let organizerClearedForPendingDbChange = false;

async function refreshOrganizerAfterTargetChange() {
  const nextId = compactTargetId(notionTarget.value);
  const currentIds = savedTargetIds();
  const changed = nextId ? !currentIds.includes(nextId) : currentIds.length > 0;
  if (changed) {
    if (!organizerClearedForPendingDbChange) {
      organizerClearedForPendingDbChange = true;
      organizerData = {
        status: "cleared",
        scannedAt: "",
        candidateCount: 0,
        occurrenceCount: 0,
        pageCount: 0,
        groups: [],
        unclassified: [],
        manualItems: [],
        existingTopics: [],
        appliedCount: 0,
        skippedCount: 0,
        warnings: [],
        progress: null,
        canRollback: Boolean(organizerData?.canRollback)
      };
      renderOrganizer();
    }
    return;
  }
  if (!organizerClearedForPendingDbChange) return;
  organizerClearedForPendingDbChange = false;
  try {
    organizerData = await send("GET_TOPIC_ORGANIZER");
    renderOrganizer();
  } catch {
    /* keep current organizer UI if reload fails */
  }
}

notionTarget.addEventListener("input", () => {
  clearArticleCandidates(t("請先按「連接資料庫」。"));
  const key = compactTargetId(notionTarget.value);
  preferExistingTopics.checked = Boolean(key && topicOrganizerPreferences[key]);
  const matchingOption = [...notionDataSourceSelect.options]
    .find(option => compactTargetId(option.value) === key);
  notionDataSourceSelect.value = matchingOption?.value || "";
  enhancedSelects.get(notionDataSourceSelect)?.sync();
  updateDatabaseChangeWarning();
  void refreshOrganizerAfterTargetChange();
});

notionDataSourceSelect.addEventListener("change", () => {
  if (!notionDataSourceSelect.value) return;
  notionTarget.value = notionDataSourceSelect.value;
  notionTarget.dispatchEvent(new Event("input", { bubbles: true }));
});

articlePreparation.addEventListener("toggle", () => {
  if (articlePreparation.open && !articleListLoaded && !articleListBusy) {
    void loadArticleCandidates(true);
  }
});

loadArticleCandidatesButton.addEventListener("click", () => {
  void loadArticleCandidates(true);
});

loadMoreArticleCandidatesButton.addEventListener("click", () => {
  void loadArticleCandidates(false);
});

articlePageSize.addEventListener("change", () => {
  if (!articlePreparation.open || !articleTargetIsSaved()) return;
  void loadArticleCandidates(true);
});

selectAllArticles.addEventListener("change", () => {
  if (selectAllArticles.checked) {
    for (const page of articlePages) articleSelectedIds.add(page.id);
  } else {
    articleSelectedIds = new Set();
  }
  updateArticlePreparationUi();
  renderArticleCandidates();
});

clearArticleSelectionButton.addEventListener("click", () => {
  articleSelectedIds = new Set();
  updateArticlePreparationUi();
  renderArticleCandidates();
});

addArticlesToAnalysisButton.addEventListener("click", () => {
  void setSelectedArticleStatus("pending");
});

markArticlesNoAnalysisButton.addEventListener("click", () => {
  void setSelectedArticleStatus("skipped");
});

loadNotionDataSourcesButton.addEventListener("click", async () => {
  if (notionDataSourcesLoading) return;
  notionDataSourcesLoading = true;
  setBusy(true);
  loadNotionDataSourcesButton.textContent = t("載入中…");
  showNotionDataSourceStatus(t("載入中…"), "info");
  try {
    const result = await send("LIST_NOTION_DATA_SOURCES", {
      notionToken: notionToken.value.trim()
    });
    notionDataSourcesLoaded = true;
    renderNotionDataSources(result.dataSources, result.limitReached);
  } catch (error) {
    showNotionDataSourceStatus(error.message, "error");
  } finally {
    notionDataSourcesLoading = false;
    setBusy(false);
    loadNotionDataSourcesButton.textContent = notionDataSourcesLoaded
      ? t("重新整理資料庫")
      : t("載入可用資料庫");
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  setBusy(true);
  try {
    await saveSettings(true);
  } catch (error) {
    showStatus(error.message, "error", analysisSettingsStatus);
  } finally {
    setBusy(false);
  }
});

/**
 * SAVE_SETTINGS then LIST_MODELS. renderModels replaces options on the
 * active provider's model select and syncs its AnalyzerSelect. Provider tests
 * and AI calls stay in background.js.
 */
loadModelsButton.addEventListener("click", async () => {
  setBusy(true);
  showStatus(t("載入中…"), "info", modelOperationStatus);
  try {
    await saveSettings(false);
    const result = await send("LIST_MODELS");
    const select = activeModelElement();
    const previous = select.value.trim();
    renderModels(select, result.models, previous, result.recommended);
    showStatus(t("找到 {count} 個可用模型。", { count: result.models.length }), "success", modelOperationStatus);
  } catch (error) {
    showStatus(error.message, "error", modelOperationStatus);
  } finally {
    setBusy(false);
  }
});

clearButton.addEventListener("click", async () => {
  if (!confirm(t("確定要從這個 Chrome 使用者設定中清除 Notion Token 與所有 AI API Key 嗎？"))) return;
  setBusy(true);
  try {
    await send("CLEAR_CREDENTIALS");
    notionToken.value = "";
    geminiKey.value = "";
    vertexKey.value = "";
    notionToken.placeholder = "secret_…";
    geminiKey.placeholder = "AIza…";
    vertexKey.placeholder = "AIza…";
    rememberNotionToken.checked = false;
    rememberGeminiKey.checked = false;
    rememberVertexKey.checked = false;
    showStatus(t("所有金鑰已清除。"), "success", credentialsStatus);
  } catch (error) {
    showStatus(error.message, "error", credentialsStatus);
  } finally {
    setBusy(false);
    await refreshSetup();
  }
});

aiProvider.addEventListener("change", updateProviderUi);
outputLanguage.addEventListener("change", () => switchOutputLanguage(outputLanguage.value));

// ==== Output-spec editing ====
function updateOutputSpecSummary() {
  const spec = currentOutputSpec();
  outputSpecSummary.textContent = outputSpecSummaryText(spec, currentOutputLanguage);
}

for (const [key, limit] of Object.entries(OUTPUT_SPEC_LIMITS)) {
  limit.input.addEventListener("input", () => {
    const currentLimit = OUTPUT_SPEC_LIMITS[key];
    const value = Number(limit.input.value);
    if (Number.isFinite(value) && value > currentLimit.max) limit.input.value = String(currentLimit.max);
    updateOutputSpecSummary();
  });
  limit.input.addEventListener("change", () => {
    limit.input.value = String(clampOutputValue(key, limit.input.value));
    updateOutputSpecSummary();
  });
}
document.querySelector("#reset-output-spec").addEventListener("click", () => {
  setVisibleOutputSpec(DEFAULT_OUTPUT_SPECS[currentOutputLanguage], currentOutputLanguage);
  updateOutputSpecSummary();
  showStatus(t("{value}輸出規格已恢復預設值；儲存後生效。", { value: outputLanguageLabel() }), "info", analysisSettingsStatus);
});
// ==== Summary writing preferences ====
function updateSummaryInstructionsStatus() {
  const busy = settingsBusy || summaryInstructionsBusy || !summaryInstructionsLoaded;
  const draft = summaryInstructions.value.trim();
  summaryInstructions.disabled = busy;
  applySummaryInstructionsButton.disabled = busy || draft === savedSummaryInstructions;
  resetSummaryInstructionsButton.disabled = busy || (!draft && !savedSummaryInstructions);
  summaryInstructionsStatus.classList.remove("is-pending", "is-busy", "is-ready");
  if (!summaryInstructionsLoaded) {
    summaryInstructionsStatus.classList.add("is-busy");
    return;
  }
  if (summaryInstructionsBusy) {
    summaryInstructionsStatus.classList.add("is-busy");
    summaryInstructionsStatus.textContent = t("處理中…");
  } else if (draft !== savedSummaryInstructions) {
    summaryInstructionsStatus.classList.add("is-pending");
    summaryInstructionsStatus.textContent = t("摘要指引尚未套用。");
  } else {
    summaryInstructionsStatus.classList.add("is-ready");
    summaryInstructionsStatus.textContent = savedSummaryInstructions
      ? t("已套用自訂摘要指引；後續分析時使用。")
      : t("目前使用預設摘要方式。");
  }
}

async function persistSummaryInstructions(value, reset = false) {
  if (!summaryInstructionsLoaded || settingsBusy || summaryInstructionsBusy) return;
  summaryInstructionsBusy = true;
  setBusy(true);
  try {
    const config = await send("SAVE_SETTINGS", {
      summaryOnly: true,
      settings: { summaryInstructions: value }
    });
    savedSummaryInstructions = config.summaryInstructions;
    summaryInstructions.value = savedSummaryInstructions;
    showStatus(reset ? t("已恢復預設摘要方式。") : t("已套用摘要指引。"), "success", analysisSettingsStatus);
  } catch (error) {
    showStatus(error.message, "error", analysisSettingsStatus);
  } finally {
    summaryInstructionsBusy = false;
    setBusy(false);
  }
}

summaryInstructions.addEventListener("input", updateSummaryInstructionsStatus);
applySummaryInstructionsButton.addEventListener("click", () => persistSummaryInstructions(summaryInstructions.value));
resetSummaryInstructionsButton.addEventListener("click", () => persistSummaryInstructions("", true));

// ==== Topic organizer rendering ====
/**
 * Unclassified AI 暫定主題 pills. Clicking one sets manualCandidateName and
 * re-renders the manual panel. Does not send messages.
 */
function renderUnclassifiedPills(manualItems, unclassified) {
  unclassifiedTopics.replaceChildren(...manualItems.map(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.name;
    button.classList.toggle("active", item.name === manualCandidateName);
    button.addEventListener("click", () => {
      manualCandidateName = item.name;
      renderOrganizer();
    });
    return button;
  }));
  unclassifiedSummary.textContent = t("本輪未分類 {unclassifiedCount} 個暫定主題", { unclassifiedCount: unclassified.length });
  unclassifiedPanel.hidden = unclassified.length === 0;
}

/**
 * Manual panel for one unclassified AI 暫定主題. skip stays local; discard
 * / approve / replace / custom write Notion via resolveManualTopic.
 */
function renderManualReviewPanel(manualItems) {
  const manualItem = manualItems.find(item => item.name === manualCandidateName);
  manualTopicReview.hidden = !manualItem;
  if (manualItem) {
    const index = manualItems.indexOf(manualItem);
    manualTopicProgress.textContent = t("人工確認 {value}／{manualItemsCount}", { value: index + 1, manualItemsCount: manualItems.length });
    manualTopicName.textContent = manualItem.name;
    manualTopicImpact.textContent = t("影響 {impactCount} 篇", { impactCount: manualItem.impactCount });
    manualTopicNote.textContent = manualItem.permanentlyDiscarded
      ? t("這個名稱先前已設為永久捨棄；再次確認後會從本批受影響頁面移除。")
      : "";
    const previousSelection = manualExistingTopic.value;
    manualExistingTopic.replaceChildren(...(organizerData?.existingTopics ?? []).map(topic => {
      const option = document.createElement("option");
      option.value = topic;
      option.textContent = topic;
      return option;
    }));
    if ([...manualExistingTopic.options].some(option => option.value === previousSelection)) {
      manualExistingTopic.value = previousSelection;
    }
  }
}

/**
 * Status line for the organizer panel from organizerData: page/candidate
 * counts, remaining groups, unclassified AI 暫定主題, applied/skipped counts,
 * warnings, and apply progress. Local string only; does not send messages.
 */
function organizerSummaryText(unclassified) {
  if (!organizerData?.groups?.length) {
    return organizerData?.status === "cleared"
      ? t("整理建議已清除。")
      : organizerData
      ? t("已掃描 {pageCount} 篇、{candidateCount} 個暫定主題；{result}", {
        pageCount: organizerData.pageCount,
        candidateCount: organizerData.candidateCount,
        result: unclassified.length
          ? t("本輪 {count} 個未找到合適分類。", { count: unclassified.length })
          : t("目前沒有尚待確認的建議。")
      })
      : t("尚未產生建議。");
  }
  let text = t("已掃描 {pageCount} 篇、{candidateCount} 個暫定主題；{groupCount} 組建議待確認，{unclassifiedCount} 個未分類。", {
    pageCount: organizerData.pageCount,
    candidateCount: organizerData.candidateCount,
    groupCount: organizerData.groups.length,
    unclassifiedCount: unclassified.length
  });
  if (organizerData.appliedCount) text += t(" 已套用 {count} 個暫定主題。", { count: organizerData.appliedCount });
  if (organizerData.skippedCount) text += t(" 本次暫不處理 {count} 組。", { count: organizerData.skippedCount });
  if (organizerData.warnings?.length) {
    text += t(" 另有 {warningsCount} 項安全提醒。", { warningsCount: organizerData.warnings.length });
  }
  if (organizerData.progress) {
    text += t(" 目前進度：{done}/{total}（{status}）。", { done: organizerData.progress.done, total: organizerData.progress.total, status: organizerData.status });
  }
  return text;
}


function normalizeThemeNameQuotes(text) {
  return String(text || "").replace(/『([^』]*)』/g, "「$1」");
}

function themeNameKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[「」『』《》【】（）()：:。.\s]/g, "")
    .toLocaleLowerCase("zh-Hant-TW");
}

function organizerReasonSegments(raw) {
  return normalizeThemeNameQuotes(String(raw || "").trim())
    .split("；")
    .map(part => part.trim())
    .filter(Boolean);
}

function extractComparedThemeNames(detail, labeledTheme = "") {
  const names = [];
  const labeled = String(labeledTheme || "").trim();
  if (labeled) names.push(labeled);
  const text = normalizeThemeNameQuotes(detail);
  for (const match of text.matchAll(/(?:既有主題)?「([^」]+)」/g)) {
    names.push(String(match[1] || "").trim());
  }
  return [...new Set(names.filter(Boolean))];
}

/** Layout A suggestion detail: normalize quotes only; keep「與既有主題「X」」. */
function normalizeSuggestionDetail(detail) {
  return normalizeThemeNameQuotes(detail).trim();
}

/** Trailing reuse / same-theme restatement after「；」(Layout B defense). */
function isReuseRestatementSegment(segment) {
  const text = normalizeThemeNameQuotes(segment).replace(/^說明：/, "").trim();
  if (!text) return true;
  return /符合[^；]{0,40}範疇|與該主題[^；]{0,40}相符|範圍相符|範圍相同|範圍一致|建議沿用|可以沿用|沿用既有主題|檢索範圍相符/.test(text);
}

/** Process/meta copy — must never appear as Layout B 說明. */
function isConfirmedMappingBoilerplate(segment) {
  const text = normalizeThemeNameQuotes(String(segment || "")).replace(/^說明：/, "").trim();
  return /已有經使用者確認的主題對照/.test(text);
}

/** True when a segment is unsuitable as theme-content 說明 for Layout B. */
function isNonContentExplanation(segment) {
  return isConfirmedMappingBoilerplate(segment) || isReuseRestatementSegment(segment);
}

function isRedundantExistingCompare(themeName, detail) {
  const theme = themeNameKey(themeName);
  const body = themeNameKey(detail);
  if (!body) return true;
  if (theme && (body === theme || body === `既有主題${theme}` || body === `建議沿用既有主題${theme}` || body === `沿用既有主題${theme}`)) {
    return true;
  }
  if (!theme && /^(建議)?沿用既有主題$/.test(body)) return true;
  return false;
}

/** True when the comparison target theme equals the proposed/canonical name. */
function isSameThemeComparison(proposedName, labeledTheme, detail) {
  const proposedKey = themeNameKey(proposedName);
  if (!proposedKey) return false;
  if (labeledTheme && themeNameKey(labeledTheme) === proposedKey) return true;
  return extractComparedThemeNames(detail, labeledTheme)
    .some(name => themeNameKey(name) === proposedKey);
}

function isSelfCompareExplanation(proposedName, segment) {
  const text = normalizeThemeNameQuotes(segment);
  if (isRedundantExistingCompare(proposedName, text)) return true;
  // Fit/restatement clauses with no different-theme quote (Layout B leftovers).
  if (isReuseRestatementSegment(text) && !/「[^」]+」/.test(text)) return true;
  if (!themeNameKey(proposedName)) return false;
  if (!isSameThemeComparison(proposedName, "", text)) return false;
  return /範圍相符|範圍相同|範圍一致|建議沿用|可以沿用|沿用既有主題|符合[^；]{0,40}範疇|與該主題[^；]{0,40}相符|檢索範圍相符/.test(text)
    || /^與(?:既有主題)?「[^」]+」/.test(text);
}

/**
 * Formats organizer group reason for display. Prefer structured existing/
 * comparison layout over a single「建議說明」prefix. Normalizes 『』 to 「」.
 * Never leaves 說明 + 建議 on one line joined by「；」. Stage-2 label is「建議：」(legacy「既有主題比對：」still parsed).
 */
function formatOrganizerReasonText(raw, group = {}) {
  const proposedName = String(group.standardTopic || group.standard_topic || "").trim();
  const segments = organizerReasonSegments(raw);
  const explanations = [];
  const diffSuggestions = [];
  const reuseSuggestions = [];
  let sawSameThemeCompare = false;
  for (const segment of segments) {
    // Accept「建議：」(current) and legacy「既有主題比對：」from stored suggestions.
    const match = segment.match(/^(?:建議|既有主題比對)(?:（([^）]*)）)?：(.+)$/s);
    if (!match) {
      if (isConfirmedMappingBoilerplate(segment)) {
        continue;
      }
      if (isSelfCompareExplanation(proposedName, segment)) {
        sawSameThemeCompare = true;
        continue;
      }
      explanations.push(segment.replace(/^(?:說明|建議)：/, "").trim());
      continue;
    }
    const labeledTheme = String(match[1] || "").trim();
    const detail = normalizeSuggestionDetail(match[2] || "");
    if (isConfirmedMappingBoilerplate(detail) || isRedundantExistingCompare(labeledTheme || proposedName, detail)) {
      sawSameThemeCompare = true;
      continue;
    }
    const sameTheme = group.existing === true
      || isSameThemeComparison(proposedName, labeledTheme, detail);
    if (sameTheme) {
      sawSameThemeCompare = true;
      // Layout B stage-2: keep only a genuine reuse rationale; drop scope-fluff restatements.
      if (!isReuseRestatementSegment(detail) && !isSelfCompareExplanation(proposedName, detail)) {
        reuseSuggestions.push(`建議：${detail}`);
      }
      continue;
    }
    diffSuggestions.push(`建議：${detail}`);
  }
  const treatAsExisting = group.existing === true
    || (sawSameThemeCompare && !diffSuggestions.length)
    || (reuseSuggestions.length && !diffSuggestions.length);
  const cleanExplanations = explanations.filter(Boolean);
  const definition = String(group.definition || "").trim();
  let explanation = cleanExplanations.find(part => !isNonContentExplanation(part))
    || (definition && !isConfirmedMappingBoilerplate(definition) ? definition : "")
    || "未提供說明";
  // Layout B: stage-1 說明 only as first content line; optional non-redundant 建議.
  if (treatAsExisting) {
    // Prefer the first content explanation only (drop「；」joined restatements).
    const stage1 = cleanExplanations.find(part => !isNonContentExplanation(part));
    explanation = stage1
      || (definition && !isConfirmedMappingBoilerplate(definition) ? definition : "")
      || "未提供說明";
    const suggestion = reuseSuggestions[0] || "";
    return suggestion
      ? `既有主題\n說明：${explanation}\n${suggestion}`
      : `既有主題\n說明：${explanation}`;
  }
  // Layout A: 說明 + 建議 (different existing theme). Keep「與既有主題「X」」.
  explanation = cleanExplanations.filter(part => !isNonContentExplanation(part)).join("；")
    || explanation;
  if (diffSuggestions.length) {
    return `說明：${explanation}\n${diffSuggestions.join("\n")}`;
  }
  return `說明：${explanation}`;
}

/** Renders formatted reason with bold「既有主題」label; keeps pre-line newlines. */
/**
 * The labels around a reason (說明：, 建議：, 既有主題) are part of how suggestions are stored and parsed,
 * so they stay Chinese up to here; only the line that reaches the screen follows the interface
 * language. The reason itself was written by the AI in the output language and is shown as is.
 */
function displayOrganizerReasonLine(line) {
  const labeled = line.match(/^(說明|建議)：(.*)$/s);
  if (!labeled) return line;
  const body = labeled[2] === "未提供說明" ? t("未提供說明") : labeled[2];
  return `${labeled[1] === "說明" ? t("說明：") : t("建議：")}${body}`;
}

function fillOrganizerReasonElement(el, raw, group = {}) {
  const text = formatOrganizerReasonText(raw, group);
  el.replaceChildren();
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) el.appendChild(document.createTextNode("\n"));
    if (line === "既有主題") {
      const strong = document.createElement("strong");
      strong.className = "topic-group-reason__label";
      strong.textContent = t("既有主題");
      el.appendChild(strong);
      return;
    }
    el.appendChild(document.createTextNode(displayOrganizerReasonLine(line)));
  });
}

function updateApplyProgressUi() {
  if (!applyProgress) return;
  const applying = organizerData?.status === "applying";
  const progress = organizerData?.progress;
  const total = Number(progress?.total) || 0;
  const done = Number(progress?.done) || 0;
  if (!applying && !(progress && total > 0 && done < total && organizerData?.status === "error")) {
    applyProgress.hidden = true;
    return;
  }
  applyProgress.hidden = false;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (applying ? 5 : 0);
  if (applyProgressFill) applyProgressFill.style.width = `${percent}%`;
  if (applyProgressTrack) {
    applyProgressTrack.setAttribute("aria-valuenow", String(percent));
    applyProgressTrack.setAttribute("aria-valuemax", "100");
  }
  if (applyProgressLabel) {
    applyProgressLabel.textContent = total > 0
      ? t("正在寫入 Notion… {done}／{total}", { done, total })
      : t("正在寫入 Notion…");
  }
}

function updateRollbackButton() {
  document.querySelector("#rollback-topics").disabled = !organizerData?.canRollback;
}

function topicSnapshotOutputLanguage(snapshot, fallback = "zh-TW") {
  const explicit = snapshot?.outputLanguage;
  if (explicit === "en" || explicit === "zh-TW") return explicit;
  const values = [
    ...(snapshot?.unclassified ?? []),
    ...(snapshot?.groups ?? []).flatMap(group => [
      group?.standardTopic,
      group?.standard_topic,
      ...(group?.aliases ?? [])
    ])
  ].filter(value => typeof value === "string");
  // Old snapshots have no language marker. Latin names or multi-word English
  // labels should keep the English topic input constraints for compatibility.
  const hasLongLatinLabel = values.some(value =>
    /[A-Za-z]/.test(value) && value.replace(/\s+/g, "").length > 6
  );
  return hasLongLatinLabel ? "en" : normalizedOutputLanguage(fallback);
}

/**
 * One organizer group card: standard name (may become confirmed AI 主題),
 * alias checkboxes for AI 暫定主題, skip via SKIP_TOPIC_GROUP. Draft
 * selected / selectedAliases / standardTopic live on the group object; skip
 * sends organizerData.groups to the background and persists them, as apply
 * does. They do not remain local until apply.
 */
function renderOrganizerGroupCard(group) {
  const card = document.createElement("article");
  card.className = `topic-group${group.selected ? " selected" : ""}`;
  const head = document.createElement("div");
  head.className = "topic-group-head";
  const selected = document.createElement("input");
  selected.type = "checkbox";
  selected.checked = Boolean(group.selected);
  selected.setAttribute("aria-label", t("選取建議主題：{topic}", { topic: group.standardTopic || t("未命名主題") }));
  selected.addEventListener("change", () => {
    group.selected = selected.checked;
    if (selected.checked && !(group.selectedAliases ?? []).length) {
      group.selectedAliases = [...(group.aliases ?? [])];
      renderOrganizer();
      return;
    }
    card.classList.toggle("selected", selected.checked);
  });
  const name = document.createElement("input");
  name.type = "text";
  name.value = group.standardTopic;
  name.setAttribute("aria-label", t("標準主題名稱"));
  name.addEventListener("input", () => { group.standardTopic = name.value.trim(); });
  const confidence = document.createElement("span");
  confidence.className = "confidence";
  confidence.textContent = group.confidence === "high" ? t("高信心") : group.confidence === "medium" ? t("中信心") : t("低信心");
  head.append(selected, name, confidence);
  const reason = document.createElement("p");
  reason.className = "hint topic-group-reason";
  fillOrganizerReasonElement(reason, group.reason || group.definition || "", group);
  const source = document.createElement("p");
  source.className = "topic-source";
  source.textContent = (group.aliases ?? []).length > 1
    ? t("可合併為此分類的暫定主題（可分開勾選）")
    : t("建議加入此既有 AI 主題");
  const aliasList = document.createElement("div");
  aliasList.className = "alias-list";
  const selectedAliasKeys = new Set((group.selectedAliases ?? []).map(topic => topic.normalize("NFKC").toLocaleLowerCase("zh-Hant-TW")));
  aliasList.append(...(group.aliases ?? []).map(alias => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const key = alias.normalize("NFKC").toLocaleLowerCase("zh-Hant-TW");
    checkbox.type = "checkbox";
    checkbox.checked = selectedAliasKeys.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedAliasKeys.add(key);
      else selectedAliasKeys.delete(key);
      group.selectedAliases = (group.aliases ?? []).filter(topic =>
        selectedAliasKeys.has(topic.normalize("NFKC").toLocaleLowerCase("zh-Hant-TW"))
      );
    });
    label.append(checkbox, document.createTextNode(alias));
    return label;
  }));
  const separate = document.createElement("p");
  separate.className = "hint topic-separate";
  separate.textContent = (group.keepSeparate ?? []).length
    ? t("建議保持獨立：{topics}", { topics: group.keepSeparate.join(t("、")) })
    : "";
  separate.hidden = !(group.keepSeparate ?? []).length;
  const impact = document.createElement("p");
  impact.className = "hint topic-impact";
  impact.textContent = t("若套用，將更新 {impactCount} 篇", { impactCount: group.impactCount });
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "text-button topic-skip";
  skip.textContent = t("暫不處理這個建議");
  skip.addEventListener("click", async () => {
    try {
      organizerData = await send("SKIP_TOPIC_GROUP", { groupId: group.id, groups: organizerData.groups });
      renderOrganizer();
    } catch (error) { showStatus(error.message, "error", organizerOperationStatus); }
  });
  card.append(head, reason, source, aliasList, separate, impact, skip);
  return card;
}

/**
 * Rebuilds unclassified pills, the manual panel, group cards, summary, and
 * rollback enabled state from organizerData. Draft values (selected,
 * selectedAliases, standardTopic) live on those objects and are sent with
 * SKIP_TOPIC_GROUP as well as APPLY_TOPIC_GROUPS, so skip also persists them.
 */
function renderOrganizer() {
  topicGroups.replaceChildren();
  const unclassified = organizerData?.unclassified ?? [];
  const manualItems = organizerData?.manualItems ?? unclassified.map(name => ({ name, impactCount: 0 }));
  if (!manualItems.some(item => item.name === manualCandidateName)) {
    manualCandidateName = manualItems[0]?.name || "";
  }
  renderUnclassifiedPills(manualItems, unclassified);
  renderManualReviewPanel(manualItems);
  if (!organizerData?.groups?.length) {
    organizerSummary.textContent = organizerSummaryText(unclassified);
    updateApplyProgressUi();
    updateRollbackButton();
    updateTopicLanguageUi(topicSnapshotOutputLanguage(organizerData));
    return;
  }
  organizerSummary.textContent = organizerSummaryText(unclassified);
  topicGroups.append(...organizerData.groups.map(group => renderOrganizerGroupCard(group)));
  updateApplyProgressUi();
  updateRollbackButton();
  updateTopicLanguageUi(topicSnapshotOutputLanguage(organizerData));
}

// ==== Manual unclassified-topic resolution ====
/**
 * RESOLVE_ORGANIZER_UNCLASSIFIED. skip is local-only. discard permanently
 * removes the AI 暫定主題 from affected pages without adding AI 主題.
 * approve / replace / custom write pages like apply.
 */
async function resolveManualTopic(action) {
  const candidate = manualCandidateName;
  if (!candidate) return showStatus(t("目前沒有等待人工確認的暫定主題。"), "error", organizerOperationStatus);
  if (action === "discard" && !confirm(t("確定永久捨棄「{candidate}」嗎？它會從受影響頁面的暫定主題中移除。", { candidate }))) return;
  try {
    organizerData = await send("RESOLVE_ORGANIZER_UNCLASSIFIED", {
      candidate,
      action,
      replacementTopic: manualExistingTopic.value,
      customTopic: manualCustomTopic.value.trim()
    });
    manualCustomTopic.value = "";
    renderOrganizer();
    showStatus(action === "skip"
      ? t("已暫時跳過「{candidate}」，Notion 內容保持不變。", { candidate })
      : t("已處理「{candidate}」，並更新受影響頁面的剩餘暫定主題。", { candidate }), action === "skip" ? "info" : "success", organizerOperationStatus);
  } catch (error) {
    showStatus(error.message, "error", organizerOperationStatus);
  }
}

document.querySelector("#manual-approve-topic").addEventListener("click", () => resolveManualTopic("approve"));
document.querySelector("#manual-use-existing").addEventListener("click", () => resolveManualTopic("replace"));
document.querySelector("#manual-use-custom").addEventListener("click", () => resolveManualTopic("custom"));
document.querySelector("#manual-discard-topic").addEventListener("click", () => resolveManualTopic("discard"));
document.querySelector("#manual-skip-topic").addEventListener("click", () => resolveManualTopic("skip"));

document.querySelector("#prepare-topics").addEventListener("click", async () => {
  setBusy(true);
  showStatus(t("正在收集暫定主題…"), "info", organizerOperationStatus);
  try {
    await saveSettings(false);
    organizerData = await send("PREPARE_TOPIC_ORGANIZER");
    renderOrganizer();
    showStatus(t("整理建議已產生。"), "success", organizerOperationStatus);
  } catch (error) { showStatus(error.message, "error", organizerOperationStatus); }
  finally { setBusy(false); }
});
document.querySelector("#select-high").addEventListener("click", () => {
  for (const group of organizerData?.groups ?? []) {
    group.selected = group.confidence === "high";
    if (group.selected) group.selectedAliases = [...(group.aliases ?? [])];
  }
  renderOrganizer();
});
document.querySelector("#apply-topics").addEventListener("click", async () => {
  const selectedGroups = (organizerData?.groups ?? []).filter(group => group.selected && (group.selectedAliases ?? []).length);
  const count = selectedGroups.length;
  if (!count) return showStatus(t("請先勾選至少一組建議，並保留至少一個暫定主題。"), "error", organizerOperationStatus);
  if (!confirm(t("確定套用 {count} 組建議嗎？套用後可以回復。", { count }))) return;
  const draftGroups = organizerData.groups;
  let pollTimer = 0;
  try {
    if (applyTopicsButton) applyTopicsButton.disabled = true;
    organizerData = {
      ...organizerData,
      status: "applying",
      progress: { done: 0, total: Math.max(1, Number(organizerData.pageCount) || candidateCount) }
    };
    renderOrganizer();
    showStatus(t("處理中…"), "info", organizerOperationStatus);
    pollTimer = window.setInterval(() => {
      void send("GET_TOPIC_ORGANIZER").then(live => {
        if (!live) return;
        organizerData = live;
        renderOrganizer();
      }).catch(() => {});
    }, 450);
    organizerData = await send("APPLY_TOPIC_GROUPS", { groups: draftGroups });
    renderOrganizer();
    showStatus(
      organizerData.status === "applied" ? t("已套用主題對照並更新本機字典。") : t("尚未完成，可重新套用或回復。"),
      organizerData.status === "applied" ? "success" : "info",
      organizerOperationStatus
    );
  } catch (error) {
    try {
      organizerData = await send("GET_TOPIC_ORGANIZER") || organizerData;
      renderOrganizer();
    } catch { /* keep last local organizerData */ }
    showStatus(error.message, "error", organizerOperationStatus);
  } finally {
    if (pollTimer) window.clearInterval(pollTimer);
    if (applyTopicsButton) applyTopicsButton.disabled = false;
  }
});
document.querySelector("#clear-topic-suggestions").addEventListener("click", async () => {
  if (!organizerData || !confirm(t("確定清除目前的整理建議嗎？Notion 內容與主題字典不受影響。"))) return;
  try {
    organizerData = await send("CLEAR_TOPIC_ORGANIZER");
    renderOrganizer();
    showStatus(t("整理建議已清除。"), "success", organizerOperationStatus);
  } catch (error) { showStatus(error.message, "error", organizerOperationStatus); }
});
document.querySelector("#rollback-topics").addEventListener("click", async () => {
  if (!confirm(t("確定回復上一次套用嗎？已新增的 Notion 主題選項會保留。"))) return;
  try {
    organizerData = await send("ROLLBACK_TOPIC_APPLY");
    renderOrganizer();
    showStatus(t("已回復上一次套用。"), "success", organizerOperationStatus);
  } catch (error) { showStatus(error.message, "error", organizerOperationStatus); }
});
// ==== Topic dictionary import and export ====
document.querySelector("#export-dictionary").addEventListener("click", async () => {
  try {
    const value = await send("EXPORT_TOPIC_DICTIONARY");
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `notion-ai-topic-dictionary-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showStatus(t("主題字典已匯出。"), "success", dictionaryStatus);
  } catch (error) { showStatus(error.message, "error", dictionaryStatus); }
});
importDictionaryTrigger.addEventListener("click", () => {
  closeImportModeMenu();
  importDictionary.click();
});
importModeToggle.addEventListener("click", () => {
  const opening = importModeMenu.hidden;
  importModeMenu.hidden = !opening;
  importModeToggle.setAttribute("aria-expanded", String(opening));
});
for (const option of importModeMenu.querySelectorAll(".split-btn__option")) {
  option.addEventListener("click", () => setImportMode(option.dataset.value));
}
document.addEventListener("mousedown", event => {
  if (!importSplitButton.contains(event.target)) closeImportModeMenu();
  for (const [select, controller] of enhancedSelects) {
    const root = select.closest(".custom-select");
    if (root && !root.contains(event.target)) controller.close();
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeImportModeMenu();
    closeEnhancedSelects();
  }
});
setImportMode(importMode.value);

importDictionary.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const value = JSON.parse(await file.text());
    const preview = await send("PREVIEW_TOPIC_DICTIONARY_IMPORT", { value });
    const mode = importMode.value;
    if (!confirm(t("字典包含 {total} 個主題：新增 {newCount}、更新 {updateCount}、衝突 {conflictCount}、不變 {unchangedCount}。{question}", {
      total: preview.incoming.length,
      newCount: preview.newCount,
      updateCount: preview.updateCount,
      conflictCount: preview.conflictCount,
      unchangedCount: preview.unchangedCount,
      question: mode === "overwrite" ? t("確定取代嗎？") : t("確定合併嗎？")
    }))) return;
    const result = await send("IMPORT_TOPIC_DICTIONARY", { value, mode });
    showStatus(t("已匯入 {imported} 個主題，目前字典共有 {total} 個。", { imported: result.imported, total: result.total }), "success", dictionaryStatus);
  } catch (error) { showStatus(error.message, "error", dictionaryStatus); }
  finally { event.target.value = ""; }
});

// ==== Setup summary and collapsible sections ====
function setupStateLabel(state) {
  return state === "verified" ? t("已驗證") : state === "saved" ? t("已儲存，尚未驗證") : t("尚未設定");
}
let nextSetupStep = null;

function setSectionCollapsed(section, collapsed) {
  section.classList.toggle("is-collapsed", collapsed);
  section.querySelector(".section-toggle").setAttribute("aria-expanded", String(!collapsed));
}

// Sections follow setup progress only until the user opens or closes one themselves.
function autoCollapseSection(id, collapsed) {
  const section = document.getElementById(id);
  if (!section.dataset.userToggled) setSectionCollapsed(section, collapsed);
}

function revealSection(id) {
  const section = document.getElementById(id);
  section.dataset.userToggled = "true";
  setSectionCollapsed(section, false);
  const heading = section.querySelector("h2");
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  section.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
  });
}

function initSectionToggles() {
  for (const section of document.querySelectorAll("section.panel")) {
    const heading = section.querySelector(".section-heading");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "section-toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-controls", section.id);
    // Hidden text instead of aria-label, so a screen reader also reads the visible summary beside it.
    const label = document.createElement("span");
    label.className = "visually-hidden";
    label.textContent = t("展開或收合「{section}」", { section: heading.querySelector("h2").textContent });
    const summary = document.createElement("span");
    summary.className = "section-toggle__summary";
    const chevron = document.createElement("span");
    chevron.className = "section-toggle__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    toggle.append(label, summary, chevron);
    toggle.addEventListener("click", () => {
      section.dataset.userToggled = "true";
      setSectionCollapsed(section, !section.classList.contains("is-collapsed"));
    });
    heading.append(toggle);
  }
  for (const link of document.querySelectorAll("[data-section-link]")) {
    link.addEventListener("click", event => {
      event.preventDefault();
      revealSection(link.dataset.sectionLink);
    });
  }
}

function setSectionSummary(id, text) {
  document.getElementById(id).querySelector(".section-toggle__summary").textContent = text;
}

async function openSiftlyPopup() {
  try {
    await chrome.action.openPopup();
  } catch {
    // Chrome may refuse to open the popup from a page; the toolbar icon always works.
    showStatus(t("請點瀏覽器工具列上的 Siftly 圖示開始分析。"), "info");
  }
}

/**
 * Shows where setup stands (from the background's `setup`), the single next step, and a one-line
 * summary on each finished section. "saved" is entered but not yet proven by a connection test.
 */
function renderSetup(setup) {
  if (!setup) return;
  const fieldsReady = setup.fields === "ready";
  // Only a verified connection has actually read the database; before that the fields are unknown, not absent.
  const fieldsUnknown = !fieldsReady && setup.notion !== "verified";
  const fieldsLabel = fieldsReady ? t("已就緒") : fieldsUnknown ? t("尚未檢查") : t("尚未建立");
  // A verified connection is named, so the summary says which database the rest applies to.
  const notionLabel = setup.notion === "verified" && setup.databaseTitle
    ? `${displayTitle(setup.databaseTitle)} · ${setupStateLabel(setup.notion)}`
    : setupStateLabel(setup.notion);
  const labels = { notion: notionLabel, ai: setupStateLabel(setup.ai), fields: fieldsLabel };
  for (const [key, label] of Object.entries(labels)) {
    const item = document.querySelector(`[data-setup-item="${key}"]`);
    item.dataset.state = setup[key] === "verified" || setup[key] === "ready" ? "done" : setup[key];
    item.querySelector(".setup-summary__state").textContent = label;
  }
  if (setup.notion === "missing") {
    nextSetupStep = { text: t("下一步：貼上 Notion Token 並選擇資料庫"), action: t("前往連接 Notion"), run: () => revealSection("notion-settings") };
  } else if (setup.notion !== "verified") {
    nextSetupStep = { text: t("下一步：確認 Notion 資料庫連線"), action: t("連接資料庫"), run: connectNotionFromUi };
  } else if (setup.ai === "missing") {
    nextSetupStep = { text: t("下一步：選擇 AI 服務並填入金鑰"), action: t("前往連接 AI 服務"), run: () => revealSection("ai-settings") };
  } else if (setup.ai !== "verified") {
    nextSetupStep = { text: t("下一步：測試 AI 服務連線"), action: t("儲存並測試 AI 連線"), run: testAiConnectionFromUi };
  } else if (!fieldsReady) {
    nextSetupStep = { text: t("下一步：建立 Siftly 需要的 Notion 欄位"), action: t("建立 Siftly 欄位"), run: prepareNotionFieldsFromUi };
  } else {
    nextSetupStep = { text: t("設定完成，可以開始分析。"), action: t("開啟 Siftly 開始分析"), run: openSiftlyPopup };
  }
  setupNextText.textContent = nextSetupStep.text;
  setupNextAction.textContent = nextSetupStep.action;
  setupNextAction.hidden = false;

  setSectionSummary("notion-settings", labels.notion);
  setSectionSummary("ai-settings", labels.ai);
  setSectionSummary("notion-fields", fieldsLabel);
  setSectionSummary("topic-organizer-panel", fieldsReady ? "" : t("準備欄位並分析文章後才有主題可整理"));
  autoCollapseSection("notion-settings", setup.notion === "verified");
  autoCollapseSection("ai-settings", setup.ai === "verified");
  autoCollapseSection("notion-fields", fieldsReady);
  autoCollapseSection("topic-organizer-panel", !fieldsReady);

  if (setup.notion === "missing") notionSetupGuide.open = true;
  articlePreparation.hidden = !fieldsReady;
  fieldsStatus.textContent = fieldsReady
    ? t("欄位已就緒，可以開始分析。")
    : setup.notion === "missing" ? t("請先連接 Notion，再準備欄位。")
      : fieldsUnknown ? t("還沒檢查這個資料庫的欄位。") : t("這個資料庫還沒有 Siftly 欄位。");
  prepareFieldsButton.textContent = fieldsReady ? t("重新檢查欄位") : fieldsUnknown ? t("檢查並建立 Siftly 欄位") : t("建立 Siftly 欄位");
  // The list is the only description of what the button adds, so it stays open until the fields exist.
  if (!fieldsReady) fieldDetails.open = true;
}

async function refreshSetup() {
  try {
    renderSetup((await send("GET_CONFIG")).setup);
  } catch {
    // The summary keeps its last state; the action that just ran already reported its own result.
  }
}

// Saves the form, then adds the fields and status options the database does not have yet.
async function prepareNotionFieldsFromUi() {
  setBusy(true);
  showStatus(t("處理中…"), "info", connectionStatus);
  try {
    await saveSettings(false);
    const prepared = await send("PREPARE_NOTION_FIELDS");
    const created = [...prepared.addedColumns, ...prepared.addedOptions];
    showStatus(created.length
      ? t("已在「{title}」建立：{created}。", {
        title: displayTitle(prepared.title) || t("Notion 資料庫"),
        created: created.join(t("、"))
      })
      : t("欄位已齊全，不需要修改 Notion。"), "success");
    // The section collapses once its fields are ready, so the result goes to the summary instead.
    clearStatus(connectionStatus);
  } catch (error) {
    showStatus(error.message, "error", connectionStatus);
  } finally {
    setBusy(false);
    await refreshSetup();
  }
}

// Saves the chosen database and confirms the token can read it. Creates nothing in Notion.
async function connectNotionFromUi() {
  setBusy(true);
  showNotionDataSourceStatus(t("處理中…"));
  try {
    await saveSettings(false);
    const result = await send("TEST_NOTION_CONNECTION");
    showStatus(t("已連接「{title}」。{next}", {
      title: displayTitle(result.title) || t("Notion 資料庫"),
      next: result.fieldsReady ? t("Siftly 欄位已就緒。") : t("接著請到「準備 Notion 欄位」建立欄位。")
    }), "success");
    // The section collapses once the connection is verified, so the result goes to the summary instead.
    showNotionDataSourceStatus("");
  } catch (error) {
    showNotionDataSourceStatus(error.message, "error");
  } finally {
    setBusy(false);
    await refreshSetup();
  }
}

// Tests the AI service on its own; needs no Notion database or fields.
async function testAiConnectionFromUi() {
  setBusy(true);
  showStatus(t("處理中…"), "info", modelOperationStatus);
  try {
    await saveSettings(false, false);
    const result = await send("TEST_AI_CONNECTION");
    const providerName = result.provider === "vertex" ? "Vertex AI" : "Google AI Studio";
    if (result.selectedAvailable) {
      // The section collapses once the service is verified, so the result goes to the summary instead.
      showStatus(t("{providerName} 連線成功，目前模型可用。", { providerName }), "success");
      clearStatus(modelOperationStatus);
    } else {
      showStatus(t("{providerName} 連線成功，但找不到目前的模型，請重新選擇。", { providerName }), "info", modelOperationStatus);
    }
  } catch (error) {
    showStatus(error.message, "error", modelOperationStatus);
  } finally {
    setBusy(false);
    await refreshSetup();
  }
}

// The page is built once in one language, so a new language takes effect by reloading it.
uiLanguage.addEventListener("change", async () => {
  try {
    await send("SET_UI_LANGUAGE", { language: uiLanguage.value });
    location.reload();
  } catch (error) {
    showStatus(error.message, "error");
  }
});

setupNextAction.addEventListener("click", () => nextSetupStep?.run());
testAiButton.addEventListener("click", testAiConnectionFromUi);
for (const button of connectNotionButtons) button.addEventListener("click", connectNotionFromUi);
prepareFieldsButton.addEventListener("click", prepareNotionFieldsFromUi);
initSectionToggles();

// ==== Settings section navigation ====
function initSectionNavigation() {
  const navigation = document.querySelector("#section-navigation");
  if (!navigation) return;
  const sections = [...navigation.querySelectorAll("[data-section-target]")]
    .map(link => ({ link, target: document.getElementById(link.dataset.sectionTarget) }))
    .filter(section => section.target);
  if (!sections.length) return;

  function markCurrent(current) {
    for (const section of sections) {
      if (section === current) section.link.setAttribute("aria-current", "location");
      else section.link.removeAttribute("aria-current");
    }
  }

  function updateCurrent() {
    const readingLine = Math.min(160, window.innerHeight * 0.25);
    let current = sections[0];
    for (const section of sections) {
      if (section.target.getBoundingClientRect().top <= readingLine) current = section;
    }
    // The last section may never reach the reading line on a short page.
    const scroller = document.scrollingElement;
    if (scroller && scroller.scrollHeight > scroller.clientHeight
      && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      current = sections[sections.length - 1];
    }
    markCurrent(current);
  }

  let updateQueued = false;
  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    window.requestAnimationFrame(() => {
      updateQueued = false;
      updateCurrent();
    });
  }

  for (const section of sections) {
    section.link.addEventListener("click", event => {
      event.preventDefault();
      closeEnhancedSelects();
      closeImportModeMenu();
      // Reveal the destination before measuring or scrolling to it.
      for (let ancestor = section.target; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === "DETAILS") ancestor.open = true;
      }
      if (section.target.classList.contains("panel")) setSectionCollapsed(section.target, false);
      if (section.target.id === "advanced-settings") {
        const details = section.target.querySelector("details");
        if (details) details.open = true;
      }
      const focusTarget = section.target.tagName === "DETAILS"
        ? section.target.querySelector("summary")
        : section.target.querySelector("h2") || section.target;
      if (focusTarget) {
        if (!focusTarget.matches("summary")) focusTarget.tabIndex = -1;
        focusTarget.focus({ preventScroll: true });
      }
      markCurrent(section);
      section.target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
    });
  }
  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate);
  document.addEventListener("toggle", scheduleUpdate, true);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(scheduleUpdate).observe(form);
  updateCurrent();
}

initSectionNavigation();

void loadConfig();
