"use strict";

// Service worker: page-text analysis pipeline (no queue ownership).

// ==== Analysis pipeline ====
async function readPageRecords(pageId, token, signal) {
  const records = [];
  let blockCount = 0;
  const nonRecursive = new Set(["child_page", "child_database", "image", "video", "audio", "file", "pdf"]);

  async function walk(parentId, depth) {
    if (depth > 25) throw new AppError(t("Notion 頁面巢狀層級過深，已停止以避免讀取異常"), { code: "BLOCK_DEPTH" });
    let cursor = "";
    do {
      const query = new URLSearchParams({ page_size: "100" });
      if (cursor) query.set("start_cursor", cursor);
      const response = await notionRequest(`/v1/blocks/${parentId}/children?${query}`, {
        signal,
        token
      });
      for (const block of response.results ?? []) {
        blockCount += 1;
        if (blockCount > MAX_BLOCKS) {
          throw new AppError(t("頁面超過 {limit} 個區塊，為避免失控已停止", { limit: MAX_BLOCKS }), { code: "TOO_MANY_BLOCKS" });
        }
        records.push(N.blockToRecord(block, depth));
        if (block.has_children && !nonRecursive.has(block.type)) await walk(block.id, depth + 1);
      }
      cursor = response.has_more ? response.next_cursor || "" : "";
    } while (cursor);
  }

  await walk(pageId, 0);
  return records;
}

/**
 * Asks the configured AI provider for a structured article analysis and
 * validates the JSON. One repair request is sent if the first payload is
 * fixable. Does not read or write Notion. Validation updates the processing stage
 * through setStage; this function does not own queue mutation. AbortError and
 * AppError propagate to processItem, which owns pause, requeue, and failure
 * recording. Used for both direct articles and the final merge of chunk notes.
 */
async function generateAndValidate(
  sourcePrompt,
  provider,
  model,
  apiKey,
  signal,
  topicNames = [],
  allowTopicProposals = true,
  excludedPersonTerms = [],
  analysisOptions = {}
) {
  let raw = "";
  let errors = [];
  let firstResponse = null;
  const diagnostic = { attempts: [], model, provider };
  const initialPayload = G.buildAnalysisRequest(sourcePrompt, model, analysisOptions);
  if (analysisOptions.enforceInputLimit) {
    await setStage(t("檢查 AI 輸入"), { model, provider });
    await assertAiInputTokenLimit(provider, model, initialPayload, { apiKey, signal });
  }
  try {
    firstResponse = await timedAiRequest(
      provider,
      model,
      initialPayload,
      { apiKey, signal, timeoutMinutes: analysisOptions.requestTimeoutMinutes }
    );
    await setStage(t("驗證輸出"), { model, provider });
    const parsed = G.parseJsonCandidate(firstResponse);
    raw = parsed.raw;
    diagnostic.attempts.push({ attempt: 1, ...G.responseDiagnostic(firstResponse, raw) });
    const checked = G.validateAnalysis(
      parsed.value,
      topicNames,
      allowTopicProposals,
      excludedPersonTerms,
      analysisOptions.outputSpec,
      analysisOptions.outputLanguage
    );
    if (checked.ok) return checked.value;
    errors = checked.errors;
  } catch (error) {
    if (error instanceof AppError || error?.name === "AbortError") throw error;
    raw = error.rawOutput || "";
    errors = [error.message || "輸出無法解析"];
    if (firstResponse && !diagnostic.attempts.length) {
      diagnostic.attempts.push({ attempt: 1, ...G.responseDiagnostic(firstResponse, raw) });
    }
    if (error?.nonRetryable || !raw) {
      throw new AppError(error.message || t("AI 沒有回傳可修正的結果"), {
        code: error?.blockReason ? "CONTENT_BLOCKED" : "OUTPUT_EMPTY",
        diagnostic
      });
    }
  }

  let repairResponse;
  try {
    repairResponse = await timedAiRequest(
      provider,
      model,
      G.buildRepairRequest(raw, errors, model, analysisOptions),
      { apiKey, signal, timeoutMinutes: analysisOptions.requestTimeoutMinutes }
    );
  } catch (error) {
    if (error instanceof AppError && !error.diagnostic) error.diagnostic = diagnostic;
    throw error;
  }
  let parsedRepair;
  try {
    parsedRepair = G.parseJsonCandidate(repairResponse);
    diagnostic.attempts.push({ attempt: 2, ...G.responseDiagnostic(repairResponse, parsedRepair.raw) });
  } catch (error) {
    diagnostic.attempts.push({
      attempt: 2,
      ...G.responseDiagnostic(repairResponse, error.rawOutput || "")
    });
    throw new AppError(t("AI 修正輸出仍無法解析：{message}", { message: error.message }), {
      code: "OUTPUT_INVALID",
      diagnostic
    });
  }
  const checkedRepair = G.validateAnalysis(
    parsedRepair.value,
    topicNames,
    allowTopicProposals,
    excludedPersonTerms,
    analysisOptions.outputSpec,
    analysisOptions.outputLanguage
  );
  if (!checkedRepair.ok) {
    throw new AppError(t("AI 修正輸出仍未符合規則：{errors}", { errors: checkedRepair.errors.join("；") }), {
      code: "OUTPUT_INVALID",
      diagnostic: { ...diagnostic, validationErrorCount: checkedRepair.errors.length }
    });
  }
  return checkedRepair.value;
}

/**
 * Summarizes one chunk of a long article into notes for a later
 * generateAndValidate merge. Calls the AI provider (initial attempt plus one
 * repair). No Notion I/O. Validation updates the processing stage through
 * setStage; this function does not own queue mutation. Invoked only from
 * analyzeArticle when the article exceeds the provider's direct-text limit.
 */
async function extractChunkNote(chunk, index, total, provider, model, apiKey, signal, requestTimeoutMinutes, outputLanguage = "zh-TW") {
  const promptOptions = { outputLanguage };
  let payload = G.buildChunkRequest(chunk, index, total, model, promptOptions);
  let lastError = null;
  const diagnostic = { attempts: [], chunk: index, model, provider };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response = null;
    try {
      response = await timedAiRequest(provider, model, payload, { apiKey, signal, timeoutMinutes: requestTimeoutMinutes });
      await setStage(t("驗證輸出"), { model, provider });
      const parsed = G.parseJsonCandidate(response);
      diagnostic.attempts.push({ attempt: attempt + 1, ...G.responseDiagnostic(response, parsed.raw) });
      const checked = G.validateChunkNotes(parsed.value);
      if (checked.ok) return checked.value;
      lastError = new Error(checked.errors.join("；"));
      payload = G.buildChunkRepairRequest(parsed.raw, checked.errors, model, promptOptions);
    } catch (error) {
      if (error instanceof AppError || error?.name === "AbortError") {
        if (error instanceof AppError && !error.diagnostic && diagnostic.attempts.length) {
          error.diagnostic = diagnostic;
        }
        throw error;
      }
      lastError = error;
      if (response) {
        diagnostic.attempts.push({
          attempt: attempt + 1,
          ...G.responseDiagnostic(response, error.rawOutput || "")
        });
      }
      if (error?.nonRetryable || !error?.rawOutput) break;
      payload = G.buildChunkRepairRequest(error.rawOutput, [error.message || "輸出無法解析"], model, promptOptions);
    }
  }
  throw new AppError(t("第 {index} 段的 AI 筆記無法解析：{error}", { index, error: lastError?.message || t("未知錯誤") }), {
    code: "CHUNK_OUTPUT_INVALID",
    diagnostic
  });
}

/**
 * Turns page plain text into validated title, keywords, summary, and
 * provisional topics (AI 暫定主題). Sits between page read and Notion write
 * inside processItem. Calls the AI provider; does not touch Notion or the
 * queue. Short articles use generateAndValidate once. Longer ones extract
 * per-chunk notes first, then run generateAndValidate on those notes.
 */
async function analyzeArticle(articleText, config, signal) {
  const { apiKey, model, provider } = await activeAiContext(config);
  const excludedPersonTerms = normalizeExcludedPersonTerms(config.excludedPersonTerms);
  const outputLanguage = P.normalizeOutputLanguage(config.outputLanguage);
  const analysisOptions = {
    customPrompt: "",
    summaryInstructions: P.normalizeSummaryInstructions(config.summaryInstructions),
    outputLanguage,
    outputSpec: P.normalizeOutputSpec(outputLanguage === "en" ? config.englishOutputSpec : config.outputSpec, outputLanguage),
    requestTimeoutMinutes: Number(config.requestTimeoutMinutes) || 0
  };
  const directTextLimit = G.DIRECT_TEXT_LIMIT;
  const chunkTextLimit = G.CHUNK_TEXT_LIMIT;
  if (articleText.length <= directTextLimit) {
    return generateAndValidate(
      P.buildArticlePrompt(articleText, [], true, excludedPersonTerms, { outputLanguage }),
      provider,
      model,
      apiKey,
      signal,
      [],
      true,
      excludedPersonTerms,
      { ...analysisOptions, enforceInputLimit: true }
    );
  }

  const chunks = S.chunkText(articleText, chunkTextLimit);
  const notes = [];
  for (let index = 0; index < chunks.length; index += 1) {
    notes.push(await extractChunkNote(
      chunks[index], index + 1, chunks.length, provider, model, apiKey, signal,
      analysisOptions.requestTimeoutMinutes,
      outputLanguage
    ));
  }
  const notesPrompt = P.buildNotesPrompt(
    G.formatChunkNotes(notes, outputLanguage),
    [],
    true,
    excludedPersonTerms,
    { outputLanguage }
  );
  return generateAndValidate(
    notesPrompt,
    provider,
    model,
    apiKey,
    signal,
    [],
    true,
    excludedPersonTerms,
    analysisOptions
  );
}
