"use strict";

// Explicit article selection: previews are transient, status writes never call AI.
let articleSelectionBusy = false;

function assertArticleSelectionIdle() {
  if (articleSelectionBusy) {
    throw new AppError(t("正在準備文章，請等候完成後再操作"), { code: "ARTICLE_SELECTION_BUSY" });
  }
}

function assertArticleSelectionAllowed() {
  assertArticleSelectionIdle();
  if (stateCache.running || stateCache.current || (!stateCache.paused && stateCache.queue.length)) {
    throw new AppError(t("請先停止分析，等目前文章處理完成後再準備文章"), { code: "BATCH_RUNNING" });
  }
}

function assertSelectionDataSource(actualId, expectedId) {
  if (!S.normalizeUuid(expectedId) || compactNotionId(actualId) !== compactNotionId(expectedId)) {
    throw new AppError(t("作用中的資料庫已變更，請重新載入文章清單"), { code: "ARTICLE_SELECTION_TARGET_CHANGED" });
  }
}

async function readArticlePreview(pageId, token, signal) {
  try {
    const response = await notionRequest(`/v1/blocks/${pageId}/children?page_size=10`, { token, signal });
    const records = (response.results ?? []).map(block => N.blockToRecord(block));
    return { preview: S.cleanText(N.buildArticleText(records)).slice(0, 300), previewUnavailable: false };
  } catch (error) {
    if (signal.aborted) throw error;
    return { preview: "", previewUnavailable: true };
  }
}

async function listUnanalyzedArticles(options = {}) {
  const cursor = options.cursor ?? "";
  if (typeof cursor !== "string" || cursor.length > 1000) {
    throw invalidRequest("ARTICLE_SELECTION_CURSOR_INVALID");
  }
  if (cursor && !options.dataSourceId) {
    throw invalidRequest("ARTICLE_SELECTION_TARGET_CHANGED");
  }
  assertArticleSelectionAllowed();
  articleSelectionBusy = true;
  try {
    const { config, fields, token } = await readyNotion();
    if (options.dataSourceId) assertSelectionDataSource(config.dataSourceId, options.dataSourceId);
    const result = await withAbortTimeout(async signal => {
      const response = await notionRequest(`/v1/data_sources/${config.dataSourceId}/query`, {
        method: "POST",
        body: fields.unanalyzedQueryPayload(cursor, options.pageSize),
        token,
        signal
      });
      const pages = [];
      for (const page of response.results ?? []) {
        if (!fields.isUnanalyzedArticle(page)) continue;
        const id = S.normalizeUuid(page.id);
        if (!id) continue;
        const preview = await readArticlePreview(id, token, signal);
        pages.push({ ...N.pageSummary(page), id, ...preview });
      }
      return {
        dataSourceId: config.dataSourceId,
        pages,
        nextCursor: response.has_more ? response.next_cursor || "" : "",
        hasMore: Boolean(response.has_more && response.next_cursor)
      };
    }, null, 90000, "ARTICLE_SELECTION_TIMEOUT", t("Notion 回應逾時，請稍後再試。"));
    assertSelectionDataSource((await readConfig()).dataSourceId, config.dataSourceId);
    return result;
  } finally {
    articleSelectionBusy = false;
  }
}

async function setArticleAnalysisStatus(dataSourceId, pageIds, status) {
  if (![N.STATUS.pending, N.STATUS.skipped].includes(status)) {
    throw invalidRequest("ARTICLE_SELECTION_STATUS_INVALID");
  }
  if (!Array.isArray(pageIds) || !pageIds.length || pageIds.length > 50
    || pageIds.some(id => typeof id !== "string" || !S.normalizeUuid(id))) {
    throw new AppError(t("每次請選取 1～50 篇有效文章"), { code: "ARTICLE_SELECTION_PAGES_INVALID" });
  }
  assertArticleSelectionAllowed();
  articleSelectionBusy = true;
  try {
    // Validate the target before allowing any page PATCH.
    assertSelectionDataSource((await readConfig()).dataSourceId, dataSourceId);
    const { config, fields, token } = await readyNotion();
    assertSelectionDataSource(config.dataSourceId, dataSourceId);
    const result = { dataSourceId: config.dataSourceId, updatedIds: [], skipped: [], failed: [] };
    const ids = [...new Set(pageIds.map(S.normalizeUuid))];
    const deadline = Date.now() + 90000;
    try {
      for (const [index, id] of ids.entries()) {
        if (Date.now() >= deadline) {
          result.failed.push(...ids.slice(index).map(remaining => ({ id: remaining, message: t("本批等待時間已達上限，請重試剩餘文章") })));
          break;
        }
        try {
          const outcome = await withAbortTimeout(async signal => {
            assertSelectionDataSource((await readConfig()).dataSourceId, config.dataSourceId);
            const page = await notionRequest(`/v1/pages/${id}`, { token, signal });
            if (compactNotionId(page.id) !== compactNotionId(id)
              || compactNotionId(page.parent?.data_source_id) !== compactNotionId(config.dataSourceId)) {
              return t("文章不屬於目前資料庫");
            }
            if (!fields.isUnanalyzedArticle(page)) return t("文章已有分析內容或整理狀態，已保留原樣");
            assertSelectionDataSource((await readConfig()).dataSourceId, config.dataSourceId);
            await notionRequest(`/v1/pages/${id}`, {
              method: "PATCH", body: fields.statusUpdatePayload(status), token, signal
            });
            return "";
          }, null, 30000, "ARTICLE_SELECTION_WRITE_TIMEOUT", t("Notion 回應逾時，請稍後再試。"));
          if (outcome) result.skipped.push({ id, reason: outcome });
          else result.updatedIds.push(id);
        } catch (error) {
          result.failed.push({ id, message: S.truncateMessage(error.message || t("設定失敗"), 300) });
          // Stop issuing writes if another page/session changed the saved target.
          if (error.code === "ARTICLE_SELECTION_TARGET_CHANGED") {
            for (const remaining of ids) {
              if (![...result.updatedIds, ...result.skipped.map(item => item.id), ...result.failed.map(item => item.id)].includes(remaining)) {
                result.failed.push({ id: remaining, message: t("資料庫已變更，請重新載入文章清單") });
              }
            }
            break;
          }
        }
      }
    } finally {
      if (result.updatedIds.length) {
        stateCache.pendingScan = null;
        stateCache.knownPending = null;
        stateCache.databaseCheck = null;
        stateCache.lastScanAt = "";
        if (stateCache.lastError === NO_PENDING_PAGES_MESSAGE) stateCache.lastError = "";
        await persistState();
      }
    }
    return result;
  } finally {
    articleSelectionBusy = false;
  }
}
