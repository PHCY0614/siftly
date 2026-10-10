"use strict";

// Service worker: single-page topic review, inspect, and reanalyze.

// ==== Topic-review helpers ====
function ensureNoTopicReview() {
  if (stateCache.topicReview) {
    throw new AppError(t("目前有一篇文章等待確認新主題，請先完成確認"), {
      code: "TOPIC_REVIEW_PENDING"
    });
  }
}

function uniqueTopicNames(values) {
  const seen = new Set();
  return (values ?? []).filter(value => {
    const key = N.topicKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ==== Single-page topic review resolution ====
/**
 * Resolves the next single-page AI 暫定主題 candidate. No AI.
 * approve/replace/custom immediately PATCH that page: drop the candidate from
 * AI 暫定主題 and add the chosen name to AI 主題; 整理狀態 becomes 已分析 only
 * when that write leaves no remaining provisionals, otherwise 待主題確認.
 * skip is local-only (temporarily_skipped) and does not write Notion.
 * discard removes the candidate from AI 暫定主題 without adding AI 主題, and
 * records it in discardedTopicNames. Local topicReview stays until
 * remainingCandidates is empty.
 */
async function resolveTopicReview(action, replacementTopic = "", customTopic = "", rememberMapping = true) {
  assertIdle();
  const review = normalizeTopicReview(stateCache.topicReview);
  const currentCandidate = review?.remainingCandidates?.[0];
  if (!review?.item || !currentCandidate?.name) {
    throw new AppError(t("目前沒有等待確認的新主題"), { code: "TOPIC_REVIEW_MISSING" });
  }

  const config = await readConfig();
  const fields = fieldsFor(config);
  const token = await requireNotionToken();
  let currentOptions = validTopicOptions(await readTopicOptions(config, token));
  const byKey = new Map(currentOptions.map(option => [N.topicKey(option.name), option.name]));
  const candidate = S.cleanText(currentCandidate.name);
  const outputLanguage = topicSessionLanguage(review);
  if (action === "approve") assertTopicLabel(candidate, topicLabelLanguage(candidate, outputLanguage));
  let topicDecision = action;
  let selectedTopic = "";

  if (action === "approve") {
    const existingCandidate = byKey.get(N.topicKey(candidate));
    selectedTopic = existingCandidate || candidate;
    topicDecision = existingCandidate ? "candidate_already_exists" : "approved_new";
  } else if (action === "replace") {
    const replacement = byKey.get(N.topicKey(replacementTopic));
    if (!replacement) {
      throw new AppError(t("請從 Notion 既有主題中選擇"), { code: "TOPIC_REPLACEMENT_INVALID" });
    }
    selectedTopic = replacement;
    topicDecision = "replaced_with_existing";
  } else if (action === "custom") {
    const custom = S.cleanText(customTopic);
    assertTopicLabel(custom, outputLanguage);
    const existingCustom = byKey.get(N.topicKey(custom));
    selectedTopic = existingCustom || custom;
    topicDecision = existingCustom ? "custom_existing" : "custom_new";
  } else if (action === "skip") {
    review.skippedCandidates.push(candidate);
    topicDecision = "temporarily_skipped";
  } else if (action === "discard") {
    topicDecision = "discarded";
  } else {
    throw invalidRequest("TOPIC_REVIEW_ACTION_INVALID");
  }

  if (selectedTopic && !byKey.has(N.topicKey(selectedTopic))) {
    await notionRequest(`/v1/data_sources/${config.dataSourceId}`, {
      method: "PATCH",
      body: fields.topicOptionsUpdatePayload(currentOptions, [selectedTopic]),
      retrySafe: true,
      token
    });
    currentOptions = validTopicOptions(await readTopicOptions(config, token));
    const savedName = currentOptions.find(option => N.topicKey(option.name) === N.topicKey(selectedTopic))?.name || selectedTopic;
    selectedTopic = savedName;
    byKey.set(N.topicKey(savedName), savedName);
    review.topicOptions = currentOptions;
  }

  const decision = {
    action: topicDecision,
    candidate,
    selectedTopic,
    rememberMapping: Boolean(rememberMapping) && Boolean(selectedTopic)
  };
  review.decisions.push(decision);
  review.remainingCandidates = review.remainingCandidates.slice(1);

  if (selectedTopic || action === "discard") {
    const currentPage = await notionRequest(`/v1/pages/${review.item.id}`, { token });
    const currentValues = fields.pagePropertyValues(currentPage);
    const candidateKey = N.topicKey(candidate);
    const unresolvedTopics = uniqueTopicNames(
      currentValues.provisionalTopics.filter(name => N.topicKey(name) !== candidateKey)
    );
    const finalTopics = selectedTopic
      ? uniqueTopicNames([...(currentValues.aiTopics ?? []), selectedTopic])
      : uniqueTopicNames(currentValues.aiTopics ?? []);
    const status = unresolvedTopics.length ? N.STATUS.topicReview : N.STATUS.analyzed;
    await notionRequest(`/v1/pages/${review.item.id}`, {
      method: "PATCH",
      body: fields.topicApplyPayload(finalTopics, status, currentOptions, unresolvedTopics),
      retrySafe: true,
      token
    });

    if (action === "discard") {
      config.discardedTopicNames = normalizeDiscardedTopicNames([
        ...(config.discardedTopicNames ?? []),
        candidate
      ]);
    } else if (decision.rememberMapping) {
      config.topicDictionary = mergeDictionaryEntries(config.topicDictionary, [{
        name: selectedTopic,
        definition: "由單篇主題確認流程建立的主題對照。",
        aliases: [candidate],
        color: N.topicColor(selectedTopic),
        active: true
      }]);
    } else {
      const resolutions = normalizeTopicPageResolutions(config.topicPageResolutions);
      const pageMappings = { ...(resolutions[review.item.id] ?? {}) };
      pageMappings[N.topicKey(candidate)] = selectedTopic;
      resolutions[review.item.id] = pageMappings;
      config.topicPageResolutions = resolutions;
    }
    await writeConfig(config);
  }

  review.topicOptions = currentOptions;
  if (review.remainingCandidates.length) {
    stateCache.topicReview = review;
    stateCache.lastError = "";
    await persistState();
    return publicStatus();
  }

  recordSuccess(review.item, {
    approvedTopics: review.decisions
      .filter(item => ["approved_new", "custom_new"].includes(item.action))
      .map(item => item.selectedTopic),
    topicDecisions: review.decisions
  });
  stateCache.topicReview = null;
  stateCache.lastError = "";
  stateCache.mode = "idle";
  stateCache.paused = true;
  await persistState();
  return publicStatus();
}

// ==== Current-page inspection and review ====
function compactNotionId(value) {
  return String(value ?? "").replace(/-/g, "").toLocaleLowerCase("en-US");
}

function pageBelongsToConfiguredSource(page, config) {
  const pageSourceId = compactNotionId(page?.parent?.data_source_id);
  const configuredSourceId = compactNotionId(config.dataSourceId);
  if (pageSourceId) {
    return Boolean(configuredSourceId && pageSourceId === configuredSourceId);
  }
  const pageDatabaseId = compactNotionId(page?.parent?.database_id);
  const configuredDatabaseId = compactNotionId(config.databaseId);
  return Boolean(pageDatabaseId && configuredDatabaseId && pageDatabaseId === configuredDatabaseId);
}

function requirePageId(pageId) {
  const id = S.extractNotionId(pageId);
  if (!id) throw new AppError(t("目前分頁不是可辨識的 Notion 頁面"), { code: "PAGE_ID_INVALID" });
  return id;
}

async function readConfiguredPage(id, config, token) {
  const page = await notionRequest(`/v1/pages/${id}`, { token });
  if (!pageBelongsToConfiguredSource(page, config)) {
    throw new AppError(t("這個頁面不屬於目前設定的 Notion 資料庫"), { code: "PAGE_OUTSIDE_DATA_SOURCE" });
  }
  return page;
}

async function inspectPage(pageId) {
  const id = requirePageId(pageId);
  const { config, fields, token } = await readyNotion();
  const page = await readConfiguredPage(id, config, token);
  const values = fields.pagePropertyValues(page);
  return {
    ...N.pageSummary(page),
    sourceDataSourceId: config.dataSourceId,
    status: values.status,
    aiTopics: values.aiTopics,
    provisionalTopics: values.provisionalTopics,
    analyzed: [N.STATUS.analyzed, N.STATUS.topicOrganize, N.STATUS.topicReview].includes(values.status)
      || Boolean(values.aiTitle || values.keywords.length || values.aiTopics.length || values.provisionalTopics.length)
  };
}

/**
 * Opens a single-page topic review from the current Notion page's AI 暫定主題.
 * Reads the page (readyNotion may PATCH missing schema). If status is 待主題整理,
 * writes 待主題確認 so the page matches the review session. Does not call AI
 * and does not move names into AI 主題; resolveTopicReview does that later.
 */
async function reviewCurrentPageTopics(pageId) {
  ensureNoTopicReview();
  assertIdle();

  const id = requirePageId(pageId);
  const { config, fields, token } = await readyNotion();
  const page = await readConfiguredPage(id, config, token);

  const values = fields.pagePropertyValues(page);
  if (![N.STATUS.topicOrganize, N.STATUS.topicReview].includes(values.status)) {
    throw new AppError(t("目前頁面的整理狀態不是「待主題整理」或「待主題確認」"), {
      code: "PAGE_TOPIC_REVIEW_STATUS_INVALID"
    });
  }

  const provisionalTopics = uniqueTopicNames(values.provisionalTopics);
  if (!provisionalTopics.length) {
    throw new AppError(t("目前頁面沒有可整理的 AI 暫定主題"), {
      code: "PAGE_TOPIC_REVIEW_EMPTY"
    });
  }

  const topicOptions = validTopicOptions(await readTopicOptions(config, token));
  const item = {
    ...N.pageSummary(page),
    sourceDataSourceId: config.dataSourceId,
    sourceStatus: values.status
  };
  const topicReview = normalizeTopicReview({
    version: 2,
    outputLanguage: provisionalTopics.some(name => /[A-Za-z]/.test(name) && S.visibleLength(name) > 6) ? "en" : "zh-TW",
    item,
    result: { ai_topics: provisionalTopics },
    requestedAt: new Date().toISOString(),
    candidateTotal: provisionalTopics.length,
    remainingCandidates: provisionalTopics.map(name => ({ name, reason: "", closest_existing: [] })),
    topicOptions,
    originalFinalTopics: values.aiTopics,
    selectedExistingTopics: [],
    approvedNewTopics: [],
    decisions: [],
    skippedCandidates: [],
    previousMode: "single_review"
  });
  if (values.status === N.STATUS.topicOrganize) {
    await notionRequest(`/v1/pages/${id}`, {
      method: "PATCH",
      body: fields.statusUpdatePayload(N.STATUS.topicReview),
      retrySafe: true,
      token
    });
  }

  stateCache.topicReview = topicReview;
  stateCache.current = null;
  stateCache.mode = "single_review";
  stateCache.paused = true;
  stateCache.stopRequested = false;
  stateCache.lastError = "";
  await persistState();
  return publicStatus();
}

/**
 * Queues the current Notion page for single-review analysis (mode
 * single_review) and schedules processOne. Reads the page via inspectPage;
 * does not call AI. Does not write analysis fields or clear confirmed AI 主題
 * here: processItem does that when the item actually runs.
 */
async function reanalyzePage(pageId, force = false) {
  assertArticleSelectionIdle();
  ensureNoTopicReview();
  assertIdle();
  const id = requirePageId(pageId);
  const inspection = await inspectPage(id);
  assertArticleSelectionIdle();
  if (inspection.analyzed && !force) {
    throw new AppError(t("這個頁面已有分析內容，重新分析會覆寫 AI 欄位"), { code: "PAGE_OVERWRITE_CONFIRM_REQUIRED" });
  }
  stateCache.queue = uniqueItems([{ ...inspection, sourceStatus: "重新分析" }, ...stateCache.queue]);
  stateCache.paused = false;
  stateCache.stopRequested = false;
  stateCache.mode = "single_review";
  await persistState();
  scheduleProcessing();
  return publicStatus();
}
