"use strict";

// Service worker: schema, connection tests, and settings persistence.

// ==== AI model discovery and connection diagnostics ====
function recommendedVertexModels() {
  return [
    { name: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash-Lite", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash-Lite", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash-Lite", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-3.7-flash", displayName: "Gemini 3.7 Flash", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview", inputTokenLimit: null, outputTokenLimit: null },
    { name: "gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview", inputTokenLimit: null, outputTokenLimit: null }
  ];
}

async function testVertexModel(config) {
  const { apiKey, model } = await activeAiContext({ ...config, aiProvider: "vertex" });
  const response = await fetch(
    `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:countTokens`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "連線測試" }] }] })
    }
  );
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new AppError(errorMessage(data, `Vertex AI 連線測試錯誤 ${response.status}`), {
      code: [400, 401, 403].includes(response.status) ? "VERTEX_AUTH" : "VERTEX_API",
      status: response.status
    });
  }
  return true;
}

async function listGeminiModels(apiKey = "") {
  const key = apiKey || await requireGeminiKey();
  const models = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?${query}`, {
        headers: { "x-goog-api-key": key }
      });
    } catch {
      throw new AppError("無法連線到 Gemini API，請檢查網路後再試", { code: "GEMINI_NETWORK" });
    }
    const data = await readJsonResponse(response);
    if (!response.ok) {
      const code = [400, 401, 403].includes(response.status) ? "GEMINI_AUTH" : "GEMINI_API";
      throw new AppError(errorMessage(data, `Gemini API 錯誤 ${response.status}`), {
        code,
        status: response.status
      });
    }
    models.push(...(data.models ?? []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return G.usableModels({ models });
}

// ==== Notion schema and scanning ====
/**
 * Resolves a Notion database URL, database UUID, or data source UUID to one
 * data source. extractNotionId takes a UUID from notionTarget or the stored
 * dataSourceId (hyphenated or compact). GET /v1/data_sources/{id} first; a
 * 404 means treat the same UUID as a database and GET /v1/databases/{id}.
 * A database must have exactly one data_sources entry or this throws
 * DATA_SOURCE_MISSING / MULTIPLE_DATA_SOURCES (paste the Data Source ID).
 * Other API errors are rethrown. GET only: no schema PATCH. Returns the
 * data source plus dataSourceId and databaseId.
 */
async function resolveDataSource(config, token) {
  const rawId = S.extractNotionId(config.notionTarget || config.dataSourceId);
  if (!rawId) {
    throw new AppError("請填入 Notion 資料庫網址或 Data Source ID", { code: "NOTION_TARGET_MISSING" });
  }

  try {
    const dataSource = await notionRequest(`/v1/data_sources/${rawId}`, { token });
    return {
      dataSource,
      dataSourceId: dataSource.id,
      databaseId: dataSource.parent?.database_id || config.databaseId || ""
    };
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const database = await notionRequest(`/v1/databases/${rawId}`, { token });
  const sources = database.data_sources ?? [];
  if (sources.length === 0) {
    throw new AppError("這個 Notion 資料庫沒有可用的 Data Source", { code: "DATA_SOURCE_MISSING" });
  }
  if (sources.length > 1) {
    throw new AppError("這個資料庫含有多個 Data Source，請改填擷取工具設定頁顯示的 Data Source ID", {
      code: "MULTIPLE_DATA_SOURCES"
    });
  }
  const dataSource = await notionRequest(`/v1/data_sources/${sources[0].id}`, { token });
  return { dataSource, dataSourceId: dataSource.id, databaseId: database.id };
}

const FIELDS_NOT_READY_MESSAGE = "這個資料庫尚未準備 Siftly 欄位，請到設定頁準備欄位";

// One sentence per conflict, naming the column to fix in Notion.
function fieldConflictMessage(conflict) {
  return conflict.reason === "duplicate"
    ? `「${conflict.names.join("」與「")}」同時存在，請只保留一個`
    : `「${conflict.names[0]}」目前是 ${conflict.actualType || "未知"} 欄位，必須改為 ${conflict.expectedType}`;
}

/**
 * Reads the configured data source and resolves its column map. GET only. Prefers the stored
 * dataSourceId; on 404 or a missing id, calls resolveDataSource. A column the map cannot place without
 * guessing throws NOTION_FIELDS_INVALID. The saved map is used only for the data source it was made for.
 */
async function inspectNotionFields(config, token) {
  let resolved;
  if (config.dataSourceId) {
    try {
      const dataSource = await notionRequest(`/v1/data_sources/${config.dataSourceId}`, { token });
      resolved = { dataSource, dataSourceId: dataSource.id, databaseId: config.databaseId };
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  if (!resolved) resolved = await resolveDataSource(config, token);

  const saved = compactNotionId(config.columnMap?.dataSourceId) === compactNotionId(resolved.dataSourceId)
    ? config.columnMap
    : null;
  const plan = N.resolveColumnMap(resolved.dataSource.properties ?? {}, saved, config.uiLanguage);
  if (plan.conflicts.length) {
    throw new AppError(`${plan.conflicts.map(fieldConflictMessage).join("；")}。請在 Notion 修正後再試。`, {
      code: "NOTION_FIELDS_INVALID"
    });
  }
  plan.map.dataSourceId = resolved.dataSourceId;
  return { ...resolved, plan, prepared: Object.keys(plan.missing).length === 0 };
}

/**
 * Persists the resolved ids and the column map (null until every column and status option exists).
 * Copies preferExistingTopics from the notionTarget UUID key onto the data source key.
 */
async function saveNotionTarget(config, inspected) {
  const preferences = normalizeTopicOrganizerPreferences(config.preferExistingTopicsByDataSource);
  const targetKey = compactNotionId(S.extractNotionId(config.notionTarget));
  const dataSourceKey = compactNotionId(inspected.dataSourceId);
  if (dataSourceKey && targetKey && Object.hasOwn(preferences, targetKey)) {
    preferences[dataSourceKey] = preferences[targetKey];
  }
  const nextConfig = {
    ...config,
    dataSourceId: inspected.dataSourceId,
    databaseId: inspected.databaseId || config.databaseId,
    columnMap: inspected.prepared ? inspected.plan.map : null,
    preferExistingTopicsByDataSource: preferences,
    verified: { ...config.verified, notion: true }
  };
  await writeConfig(nextConfig);
  return nextConfig;
}

async function recordFieldsCheck(error) {
  if (!["NOTION_FIELDS_MISSING", "NOTION_FIELDS_INVALID"].includes(error.code)) return;
  stateCache.databaseCheck = {
    checkedAt: new Date().toISOString(),
    code: error.code,
    message: error.message,
    ready: false
  };
  stateCache.lastError = error.message;
  await persistState();
}

/**
 * Shared gate for scans, queue start, organizer, page inspection, and connection tests. Requires a
 * Notion token, reads the data source, and returns a bindColumns() instance for it. Never changes the
 * schema: absent columns or status options throw NOTION_FIELDS_MISSING, and only prepareNotionFields
 * creates them. Either field error is recorded in
 * databaseCheck so the popup can point at the setup step.
 */
async function readyNotion() {
  const token = await requireNotionToken();
  const config = await readConfig();
  try {
    const inspected = await inspectNotionFields(config, token);
    const nextConfig = await saveNotionTarget(config, inspected);
    if (!inspected.prepared) throw new AppError(FIELDS_NOT_READY_MESSAGE, { code: "NOTION_FIELDS_MISSING" });
    preparedDataSourceId = compactNotionId(nextConfig.dataSourceId);
    return { config: nextConfig, dataSource: inspected.dataSource, fields: N.bindColumns(inspected.plan.map), token };
  } catch (error) {
    await recordFieldsCheck(error);
    throw error;
  }
}

/**
 * The only place Siftly columns and status options are created, and only when the user asks for it
 * on the options page. PATCHes exactly what is absent, then reads the data source back: the saved map needs the
 * ids Notion assigned, and a retry after a partial update finds what already exists instead of adding
 * it twice. Writes no article page.
 */
async function prepareNotionFields() {
  assertIdle();
  const token = await requireNotionToken();
  const config = await readConfig();
  let inspected = await inspectNotionFields(config, token);
  const created = {
    addedColumns: inspected.plan.added.map(column => column.name),
    addedOptions: inspected.plan.addedOptions
  };
  if (!inspected.prepared) {
    await notionRequest(`/v1/data_sources/${inspected.dataSourceId}`, {
      method: "PATCH",
      body: { properties: inspected.plan.missing },
      token
    });
    inspected = await inspectNotionFields(
      { ...config, dataSourceId: inspected.dataSourceId, columnMap: inspected.plan.map },
      token
    );
    if (!inspected.prepared) {
      throw new AppError("Notion 欄位尚未建立完成，請再試一次", { code: "NOTION_FIELDS_MISSING" });
    }
  }
  await saveNotionTarget(config, inspected);
  preparedDataSourceId = compactNotionId(inspected.dataSourceId);
  if (stateCache.databaseCheck?.ready === false) {
    stateCache.databaseCheck = null;
    stateCache.lastError = "";
    await persistState();
  }
  return {
    ...created,
    dataSourceId: inspected.dataSourceId,
    title: N.dataSourceSummary(inspected.dataSource)?.title || ""
  };
}

// The bound operations for the saved data source, for steps that follow a readyNotion() in an earlier call.
function fieldsFor(config) {
  if (!config.columnMap || compactNotionId(config.columnMap.dataSourceId) !== compactNotionId(config.dataSourceId)) {
    throw new AppError(FIELDS_NOT_READY_MESSAGE, { code: "NOTION_FIELDS_MISSING" });
  }
  return N.bindColumns(config.columnMap);
}

async function readTopicOptions(config, token, signal) {
  const fields = fieldsFor(config);
  const dataSource = await notionRequest(`/v1/data_sources/${fields.dataSourceId}`, { signal, token });
  return fields.topicOptions(dataSource.properties ?? {});
}

async function queryPagesByStatus(fields, status, token, options = {}) {
  const pages = [];
  const maxPages = Math.max(1, Number(options.maxPages) || MAX_PENDING_PAGES);
  let cursor = "";
  do {
    const remaining = maxPages - pages.length;
    if (remaining <= 0) break;
    const response = await notionRequest(`/v1/data_sources/${fields.dataSourceId}/query`, {
      method: "POST",
      body: fields.queryPayload(status, cursor, Math.min(100, remaining)),
      signal: options.signal,
      token
    });
    pages.push(...(response.results ?? []).map(page => ({
      ...N.pageSummary(page),
      sourceDataSourceId: fields.dataSourceId,
      sourceStatus: status
    })));
    if (typeof options.onProgress === "function") await options.onProgress(pages.length, status);
    if (pages.length >= maxPages && response.has_more) {
      if (options.failOnLimit) {
        throw new AppError(`「${N.STATUS_NAMES[status]}」頁面超過 ${maxPages} 筆掃描上限，請先縮小待處理範圍`, {
          code: "PAGE_SCAN_LIMIT_EXCEEDED",
          diagnostic: { maxPages, status }
        });
      }
      break;
    }
    cursor = response.has_more ? response.next_cursor || "" : "";
  } while (cursor);
  return pages;
}

// ==== Settings persistence ====
/**
 * Settings-save target string. Trims the submitted or current notionTarget.
 * A non-empty value must contain a UUID (database URL, database id, or data
 * source id); otherwise NOTION_TARGET_INVALID. Empty is allowed and does
 * not call Notion. Compact UUID comparison for a database change happens in
 * saveSettings, not here.
 */
function resolveNotionTarget(settings, current) {
  const notionTarget = String(settings.notionTarget ?? current.notionTarget).trim();
  if (notionTarget && !S.extractNotionId(notionTarget)) {
    throw new AppError("Notion 資料庫網址或 Data Source ID 格式不正確", { code: "NOTION_TARGET_INVALID" });
  }
  return notionTarget;
}

function resolveProviderSelection(settings, current) {
  const aiProvider = settings.aiProvider ?? current.aiProvider;
  if (!["gemini", "vertex"].includes(aiProvider)) throw invalidRequest("AI_PROVIDER_INVALID");
  const geminiModel = S.normalizeModelName(settings.geminiModel ?? current.geminiModel) || G.DEFAULT_MODEL;
  const vertexModel = S.normalizeModelName(settings.vertexModel ?? current.vertexModel) || G.DEFAULT_MODEL;
  return {
    aiProvider,
    geminiModel,
    vertexModel
  };
}

function resolvePromptSettings(settings, current) {
  const outputSpec = P.normalizeOutputSpec(settings.outputSpec ?? current.outputSpec);
  const englishOutputSpec = P.normalizeOutputSpec(settings.englishOutputSpec ?? current.englishOutputSpec, "en");
  const outputLanguage = P.normalizeOutputLanguage(settings.outputLanguage ?? current.outputLanguage);
  const timeoutValue = Number(settings.requestTimeoutMinutes ?? current.requestTimeoutMinutes);
  const requestTimeoutMinutes = [0, 3, 5, 10].includes(timeoutValue) ? timeoutValue : 5;
  const summaryInstructions = settings.summaryInstructions === undefined
    ? P.normalizeSummaryInstructions(current.summaryInstructions)
    : validateSummaryInstructions(settings.summaryInstructions);
  return { outputSpec, englishOutputSpec, outputLanguage, requestTimeoutMinutes, summaryInstructions };
}

function validateSummaryInstructions(value) {
  if (typeof value !== "string" || value.length > P.MAX_SUMMARY_INSTRUCTION_CHARACTERS) {
    throw new AppError(`摘要指引須為文字，最多 ${P.MAX_SUMMARY_INSTRUCTION_CHARACTERS} 個字元`, {
      code: "SUMMARY_INSTRUCTIONS_INVALID"
    });
  }
  return P.normalizeSummaryInstructions(value);
}

// Save only summary preferences; leave secrets, database selection, and queue untouched.
async function saveSummaryInstructions(value) {
  const summaryInstructions = validateSummaryInstructions(value);
  const current = await readConfig();
  await writeConfig({ ...current, summaryInstructions });
  return { summaryInstructions };
}

function notionTargetChanged(current, nextTargetId) {
  const currentTargetIds = [current.notionTarget, current.dataSourceId]
    .map(value => compactNotionId(S.extractNotionId(value)))
    .filter(Boolean);
  if (!nextTargetId) return currentTargetIds.length > 0;
  return !currentTargetIds.includes(nextTargetId);
}

function resolveTopicPreferences(settings, current, targetChanged, nextTargetId) {
  const preferExistingTopicsByDataSource = normalizeTopicOrganizerPreferences(
    current.preferExistingTopicsByDataSource
  );
  const currentPreference = topicOrganizerPreference(current);
  const preferExistingTopics = settings.preferExistingTopics === undefined
    ? targetChanged
      ? Boolean(nextTargetId && preferExistingTopicsByDataSource[nextTargetId])
      : currentPreference
    : Boolean(settings.preferExistingTopics);
  if (nextTargetId) preferExistingTopicsByDataSource[nextTargetId] = preferExistingTopics;
  if (!targetChanged && current.dataSourceId) {
    preferExistingTopicsByDataSource[compactNotionId(current.dataSourceId)] = preferExistingTopics;
  }
  return { preferExistingTopics, preferExistingTopicsByDataSource };
}

/**
 * Blocks a Notion-target UUID change while a single-page topicReview is open
 * (TOPIC_REVIEW_PENDING) or while analysis has running/current
 * (DATABASE_CHANGE_WHILE_RUNNING). Does not mutate state. Must pass before
 * secrets or config are written.
 */
function assertDatabaseChangeAllowed(targetChanged) {
  if (targetChanged && stateCache?.topicReview) {
    throw new AppError("目前有一篇文章等待確認新主題，請先完成確認再更換 Notion 資料庫", {
      code: "TOPIC_REVIEW_PENDING"
    });
  }
  if (targetChanged && (stateCache?.running || stateCache?.current)) {
    throw new AppError("目前仍在分析文章。請先按停止，等目前文章回到待分析後，再更換 Notion 資料庫", {
      code: "DATABASE_CHANGE_WHILE_RUNNING"
    });
  }
}

function buildNextConfig(settings, current, resolved) {
  const { notionTarget, preferExistingTopicsByDataSource, promptSettings, provider, targetChanged } = resolved;
  const next = {
    ...current,
    allowTopicProposals: true,
    excludedPersonTerms: settings.excludedPersonTerms === undefined
      ? normalizeExcludedPersonTerms(current.excludedPersonTerms)
      : normalizeExcludedPersonTerms(settings.excludedPersonTerms),
    aiProvider: provider.aiProvider,
    notionTarget,
    geminiModel: provider.geminiModel,
    vertexModel: provider.vertexModel,
    rememberGeminiKey: Object.hasOwn(settings, "rememberGeminiKey")
      ? Boolean(settings.rememberGeminiKey)
      : Boolean(current.rememberGeminiKey),
    rememberVertexKey: Object.hasOwn(settings, "rememberVertexKey")
      ? Boolean(settings.rememberVertexKey)
      : Boolean(current.rememberVertexKey),
    rememberNotionToken: Object.hasOwn(settings, "rememberNotionToken")
      ? Boolean(settings.rememberNotionToken)
      : Boolean(current.rememberNotionToken),
    requestTimeoutMinutes: promptSettings.requestTimeoutMinutes,
    outputSpec: promptSettings.outputSpec,
    englishOutputSpec: promptSettings.englishOutputSpec,
    outputLanguage: promptSettings.outputLanguage,
    summaryInstructions: promptSettings.summaryInstructions,
    preferExistingTopicsByDataSource,
    topicAliases: targetChanged ? {} : normalizeTopicAliases(current.topicAliases),
    topicPageResolutions: targetChanged ? {} : normalizeTopicPageResolutions(current.topicPageResolutions),
    discardedTopicNames: targetChanged ? [] : normalizeDiscardedTopicNames(current.discardedTopicNames),
    topicDictionary: targetChanged ? [] : normalizeTopicDictionary(current.topicDictionary),
    dataSourceId: targetChanged ? "" : current.dataSourceId,
    databaseId: targetChanged ? "" : current.databaseId,
    columnMap: targetChanged ? null : current.columnMap,
    // A new token, key, or database has not been tested yet.
    verified: {
      notion: Boolean(current.verified?.notion) && !targetChanged && !S.cleanText(settings.notionToken),
      ai: S.cleanText(settings.geminiKey) || S.cleanText(settings.vertexKey) ? "" : current.verified?.ai || ""
    }
  };
  delete next.autoSelectHighConfidence;
  return next;
}

/**
 * After a saved target UUID change, drops work bound to the previous
 * database: queue, failed, recent, pending scan, organizer, rollback,
 * databaseCheck, and in-flight flags. Topic-resolution config (dictionary,
 * aliases, page resolutions, discardedTopicNames, stored ids) is cleared
 * on the next config object by saveSettings, not here. Does not clear
 * topicReview; a change is refused while a review is open. persistState
 * before returning the previous queue length.
 */
async function resetStateForDatabaseChange() {
  if (!stateCache) return 0;
  const clearedQueueCount = stateCache.queue.length;
  preparedDataSourceId = "";
  stateCache.databaseCheck = null;
  stateCache.queue = [];
  stateCache.failed = [];
  stateCache.recent = [];
  stateCache.knownPending = null;
  stateCache.pendingScan = null;
  stateCache.lastScanAt = "";
  stateCache.lastError = "";
  stateCache.mode = "idle";
  stateCache.paused = true;
  stateCache.running = false;
  stateCache.stopRequested = false;
  stateCache.stage = null;
  stateCache.topicOrganizer = null;
  stateCache.topicRollback = null;
  await persistState();
  return clearedQueueCount;
}

function buildSaveResponse(next, resolved) {
  const { clearedQueueCount, preferExistingTopics, provider, secrets, targetChanged } = resolved;
  const { aiProvider, geminiModel, vertexModel } = provider;
  const { hasGeminiKey, hasNotionToken, hasVertexKey } = secrets;
  return {
    ...next,
    preferExistingTopics,
    activeModel: aiProvider === "vertex" ? vertexModel : geminiModel,
    hasAiKey: aiProvider === "vertex" ? hasVertexKey : hasGeminiKey,
    hasGeminiKey,
    hasNotionToken,
    hasVertexKey,
    setup: setupStatus(next, secrets),
    databaseChanged: targetChanged,
    clearedQueueCount
  };
}

/**
 * Persists options-page settings. Guard order: parse notionTarget, provider
 * and model (MODEL_INVALID), prompt
 * and timeout, then assertDatabaseChangeAllowed. All of those must pass
 * before storeSecret or writeConfig. A compact-UUID change versus both the
 * current notionTarget and dataSourceId is a database change: the next config clears
 * dataSourceId, databaseId, topicAliases, topicPageResolutions,
 * discardedTopicNames, and topicDictionary so another database cannot reuse
 * that taxonomy or queue; then resetStateForDatabaseChange. Topic
 * preferences stay keyed per data source / target UUID and are not wiped.
 * Does not call Notion; the schema is checked later by readyNotion. Response includes has*Key booleans, not secret values.
 */
async function saveSettings(settings) {
  assertArticleSelectionIdle();
  const current = await readConfig();
  const notionTarget = resolveNotionTarget(settings, current);
  const provider = resolveProviderSelection(settings, current);
  const promptSettings = resolvePromptSettings(settings, current);
  const nextTargetId = compactNotionId(S.extractNotionId(notionTarget));
  const targetChanged = notionTargetChanged(current, nextTargetId);
  const { preferExistingTopics, preferExistingTopicsByDataSource } = resolveTopicPreferences(
    settings,
    current,
    targetChanged,
    nextTargetId
  );
  assertDatabaseChangeAllowed(targetChanged);
  assertArticleSelectionIdle();
  const next = buildNextConfig(settings, current, {
    notionTarget,
    preferExistingTopicsByDataSource,
    promptSettings,
    provider,
    targetChanged
  });
  const [hasNotionToken, hasGeminiKey, hasVertexKey] = await Promise.all([
    storeSecret(NOTION_TOKEN_KEY, settings.notionToken, next.rememberNotionToken),
    storeSecret(GEMINI_KEY_KEY, settings.geminiKey, next.rememberGeminiKey),
    storeSecret(VERTEX_KEY_KEY, settings.vertexKey, next.rememberVertexKey)
  ]);
  await writeConfig(next);
  const clearedQueueCount = targetChanged ? await resetStateForDatabaseChange() : 0;
  currentOutputLanguage = next.outputLanguage;
  return buildSaveResponse(next, {
    clearedQueueCount,
    preferExistingTopics,
    provider,
    secrets: { hasGeminiKey, hasNotionToken, hasVertexKey },
    targetChanged
  });
}

// ==== Settings UI and connection diagnostics ====
function aiFingerprint(config) {
  const provider = normalizeAiProvider(config.aiProvider);
  return `${provider}:${provider === "vertex" ? config.vertexModel : config.geminiModel}`;
}

// Where setup stands, for the options-page summary. "saved" is entered but not yet proven to work.
function setupStatus(config, secrets) {
  const hasAiKey = normalizeAiProvider(config.aiProvider) === "vertex" ? secrets.hasVertexKey : secrets.hasGeminiKey;
  const fieldsReady = Boolean(config.columnMap)
    && compactNotionId(config.columnMap.dataSourceId) === compactNotionId(config.dataSourceId);
  return {
    notion: !secrets.hasNotionToken || !config.notionTarget ? "missing" : config.verified?.notion ? "verified" : "saved",
    ai: !hasAiKey ? "missing" : config.verified?.ai === aiFingerprint(config) ? "verified" : "saved",
    fields: fieldsReady ? "ready" : "missing"
  };
}

/**
 * Options/popup config payload. Reads stored config and whether secrets exist.
 * Does not return Notion token or AI key values; exposes hasNotionToken and
 * has*Key booleans. Spreads ids, models, topic dictionary,
 * discardedTopicNames, and preferExistingTopicsByDataSource, and adds
 * preferExistingTopics for the current data source.
 * Does not call Notion or AI.
 */
async function getConfigForUi() {
  const config = await readConfig();
  const [notionToken, geminiKey, vertexKey] = await Promise.all([
    readSecret(NOTION_TOKEN_KEY),
    readSecret(GEMINI_KEY_KEY),
    readSecret(VERTEX_KEY_KEY)
  ]);
  const aiProvider = normalizeAiProvider(config.aiProvider);
  return {
    ...config,
    preferExistingTopics: topicOrganizerPreference(config),
    aiProvider,
    activeModel: aiProvider === "vertex" ? config.vertexModel : config.geminiModel,
    excludedPersonTerms: normalizeExcludedPersonTerms(config.excludedPersonTerms),
    hasAiKey: aiProvider === "vertex" ? Boolean(vertexKey) : Boolean(geminiKey),
    hasGeminiKey: Boolean(geminiKey),
    hasNotionToken: Boolean(notionToken),
    hasVertexKey: Boolean(vertexKey),
    setup: setupStatus(config, {
      hasGeminiKey: Boolean(geminiKey),
      hasNotionToken: Boolean(notionToken),
      hasVertexKey: Boolean(vertexKey)
    })
  };
}

/**
 * Contacts only the configured AI provider: Vertex countTokens on the selected model, or the Gemini
 * model list. Needs no Notion setup. Records the provider and model as verified only when the selected
 * model is actually usable.
 */
async function testAiConnection() {
  const config = await readConfig();
  const provider = normalizeAiProvider(config.aiProvider);
  let models = [];
  let selectedAvailable = false;
  if (provider === "vertex") {
    await testVertexModel(config);
    models = recommendedVertexModels();
    selectedAvailable = true;
  } else {
    models = await listGeminiModels(await requireGeminiKey());
    selectedAvailable = models.some(model => model.name === config.geminiModel);
  }
  if (selectedAvailable) {
    await writeConfig({ ...config, verified: { ...config.verified, ai: aiFingerprint(config) } });
  }
  return { modelCount: models.length, provider, selectedAvailable };
}

/**
 * Confirms the saved token can read the chosen database, and records Notion as verified. Read-only:
 * says whether the Siftly fields exist but creates nothing.
 */
async function testNotionConnection() {
  const token = await requireNotionToken();
  const config = await readConfig();
  const inspected = await inspectNotionFields(config, token);
  await saveNotionTarget(config, inspected);
  return {
    dataSourceId: inspected.dataSourceId,
    fieldsReady: inspected.prepared,
    title: N.dataSourceSummary(inspected.dataSource)?.title || ""
  };
}
