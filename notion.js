/**
 * Notion payload layer: the six Siftly columns and the workflow status options (a fixed key plus a
 * Chinese and an English name each), the column map that ties every key to a data source's own
 * property and option ids, and the request bodies and page readers built from that map.
 *
 * Does no network or storage work and remembers nothing between calls. background/settings.js reads
 * the data source, saves the map, and hands each workflow a bindColumns() instance for that data source.
 */
(function attachAnalyzerNotion(root, factory) {
  const shared = typeof module === "object" && module.exports
    ? require("./shared.js")
    : root.AnalyzerShared;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AnalyzerNotion = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAnalyzerNotion(shared) {
  "use strict";

  // ---- Columns and status options ----

  const API_VERSION = "2026-03-11";
  const MAX_STORED_PAGE_TITLE_CHARACTERS = 500;

  // AI 暫定主題 is provisional analysis output; AI 主題 is the confirmed taxonomy. They stay separate columns.
  const COLUMNS = Object.freeze({
    aiTitle: { type: "rich_text", names: { zh: "AI 標題", en: "AI Title" } },
    aiTopics: { type: "multi_select", names: { zh: "AI 主題", en: "AI Topics" } },
    provisionalTopics: { type: "rich_text", names: { zh: "AI 暫定主題", en: "AI Provisional Topics" } },
    aiKeywords: { type: "rich_text", names: { zh: "AI 關鍵字", en: "AI Keywords" } },
    aiSummary: { type: "rich_text", names: { zh: "AI 摘要", en: "AI Summary" } },
    processingStatus: { type: "select", names: { zh: "整理狀態", en: "Processing Status" } }
  });
  const STATUS_OPTIONS = Object.freeze({
    pending: { names: { zh: "待分析", en: "Pending" }, color: "yellow" },
    processing: { names: { zh: "分析中", en: "Analysing" }, color: "blue" },
    topicOrganize: { names: { zh: "待主題整理", en: "Topics to organise" }, color: "orange" },
    topicReview: { names: { zh: "待主題確認", en: "Topics to confirm" }, color: "orange" },
    analyzed: { names: { zh: "已分析", en: "Analysed" }, color: "green" },
    failed: { names: { zh: "分析失敗", en: "Failed" }, color: "red" },
    skipped: { names: { zh: "不分析", en: "Skipped" }, color: "gray" }
  });
  // The rest of the extension names a status by its key; only a bound instance knows the option's name.
  const STATUS = Object.freeze(Object.fromEntries(Object.keys(STATUS_OPTIONS).map(key => [key, key])));
  const PROPERTY_NAMES = Object.freeze(Object.fromEntries(
    Object.entries(COLUMNS).map(([key, column]) => [key, column.names.zh])
  ));
  const STATUS_NAMES = Object.freeze(Object.fromEntries(
    Object.entries(STATUS_OPTIONS).map(([key, option]) => [key, option.names.zh])
  ));
  // Columns that hold AI output. Any value in one of them marks the article as already handled.
  const AI_VALUE_KEYS = Object.freeze(["aiTitle", "aiSummary", "provisionalTopics", "aiKeywords", "aiTopics"]);

  const TOPIC_COLOR_RULES = Object.freeze([
    { color: "red", terms: ["戰爭", "軍事衝突", "武裝衝突", "犯罪", "災難", "暴力"] },
    { color: "brown", terms: ["環境", "生態環境", "農業", "土地", "自然資源", "氣候", "能源"] },
    { color: "gray", terms: ["政治", "國際", "地緣", "外交", "全球供應鏈", "公共政策", "國家治理"] },
    { color: "yellow", terms: ["階級", "資本", "殖民", "投資", "商業", "金融", "市場", "產業", "貿易"] },
    { color: "green", terms: ["心境", "情感", "生離死別", "心靈", "心理", "情緒", "創傷", "成長", "人生抉擇"] },
    { color: "pink", terms: ["社交", "八卦", "婚姻", "權力關係", "性別", "人際", "親密", "家庭", "愛情"] },
    { color: "purple", terms: ["美髮", "保養", "寵物", "造型", "穿搭", "衛生", "美容", "護膚", "彩妝"] },
    { color: "orange", terms: ["社群", "遊戲", "生物辨識", "隱私", "數位", "網路", "平台", "科技", "資安", "人工智慧", "生活日常"] },
    { color: "blue", terms: ["神祕學", "生物學", "歷史", "社會變遷", "飲食文化", "古董", "文化", "教育", "科學", "學術"] }
  ]);

  // ---- Values shared by every data source ----

  function propertyType(property) {
    if (!property || typeof property !== "object") return "";
    if (property.type) return property.type;
    return ["title", "rich_text", "multi_select", "select", "status", "date", "url", "number", "checkbox"]
      .find(type => Object.prototype.hasOwnProperty.call(property, type)) || "";
  }

  function richText(content) {
    const value = shared.cleanText(content).slice(0, 7600);
    if (!value) return [];
    const items = [];
    for (let index = 0; index < value.length; index += 1900) {
      items.push({ type: "text", text: { content: value.slice(index, index + 1900) } });
    }
    return items;
  }

  function topicKey(value) {
    return shared.cleanText(value).normalize("NFKC").toLocaleLowerCase("zh-Hant-TW");
  }

  function topicColor(value) {
    const name = shared.cleanText(value).normalize("NFKC");
    for (const rule of TOPIC_COLOR_RULES) {
      if (rule.terms.some(term => name.includes(term))) return rule.color;
    }
    return "default";
  }

  function topicMultiSelect(values, existingOptions = [], allowedNewTopics = []) {
    const existing = new Map(
      (existingOptions ?? [])
        .filter(option => option?.name)
        .map(option => [topicKey(option.name), option])
    );
    const allowedNew = new Map(
      (allowedNewTopics ?? [])
        .map(shared.cleanText)
        .filter(Boolean)
        .map(name => [topicKey(name), name])
    );
    const seen = new Set();
    return (values ?? []).reduce((result, value) => {
      const name = shared.cleanText(value);
      const key = topicKey(name);
      if (!name || !key || seen.has(key)) return result;
      seen.add(key);
      const option = existing.get(key);
      if (option?.id) {
        result.push({ id: option.id });
      } else if (option?.name) {
        result.push({ name: option.name.slice(0, 100) });
      } else if (allowedNew.has(key)) {
        result.push({ name: allowedNew.get(key).slice(0, 100) });
      } else {
        throw new Error(`AI 主題不是既有選項，且尚未獲准新增：${name}`);
      }
      return result;
    }, []);
  }

  function allPagesQueryPayload(startCursor = "", pageSize = 100) {
    const payload = {
      page_size: Math.max(1, Math.min(100, Number(pageSize) || 100)),
      sorts: [{ timestamp: "created_time", direction: "ascending" }]
    };
    if (startCursor) payload.start_cursor = startCursor;
    return payload;
  }

  function dataSourceSearchPayload(startCursor = "") {
    const payload = {
      page_size: 100,
      filter: {
        property: "object",
        value: "data_source",
        in_trash: false
      }
    };
    if (startCursor) payload.start_cursor = startCursor;
    return payload;
  }

  // ---- Schema and column map ----

  function languageOf(value) {
    return value === "en" ? "en" : "zh";
  }

  function statusOptionDefinitions(keys, language) {
    return keys.map(key => ({ name: STATUS_OPTIONS[key].names[language], color: STATUS_OPTIONS[key].color }));
  }

  function columnDefinition(key, language) {
    if (key === "processingStatus") {
      return { select: { options: statusOptionDefinitions(Object.keys(STATUS_OPTIONS), language) } };
    }
    return COLUMNS[key].type === "multi_select" ? { multi_select: { options: [] } } : { [COLUMNS[key].type]: {} };
  }

  // The six columns of a data source prepared from scratch, named in `language`.
  function analysisPropertySchema(language = "zh") {
    const lang = languageOf(language);
    return Object.fromEntries(Object.keys(COLUMNS).map(key => [COLUMNS[key].names[lang], columnDefinition(key, lang)]));
  }

  // A map for a data source whose columns carry the default names. Notion accepts a name wherever it
  // accepts an id, so payloads built from it are valid before the real ids have been read.
  function defaultColumnMap(language = "zh") {
    const lang = languageOf(language);
    return {
      dataSourceId: "",
      language: lang,
      columns: Object.fromEntries(Object.entries(COLUMNS).map(([key, column]) => [key, { id: column.names[lang], name: column.names[lang] }])),
      statusOptions: Object.fromEntries(Object.entries(STATUS_OPTIONS).map(([key, option]) => [key, { id: "", name: option.names[lang] }]))
    };
  }

  /**
   * Ties each column and status key to the data source: the id saved last time while that property is
   * still there with the right type, otherwise the one property named in either language. Never guesses:
   * a name taken by another type, or both language names present at once, is a conflict.
   * Columns and options that are absent are named in the language the data source already uses, then the
   * saved language, then `language`, so one data source never ends up with two sets.
   * @returns {{ map, missing, added, addedOptions, conflicts }} `missing` is ready to send as the
   *   `properties` of a data source update; `added` and `addedOptions` describe it for the preview.
   */
  function resolveColumnMap(properties, saved, language) {
    const entries = Object.entries(properties ?? {}).map(([name, property]) => ({
      name,
      id: String(property?.id || name),
      type: propertyType(property),
      property
    }));
    const columns = {};
    const conflicts = [];
    const absent = [];
    for (const [key, column] of Object.entries(COLUMNS)) {
      const savedId = saved?.columns?.[key]?.id;
      const named = entries.filter(entry => Object.values(column.names).includes(entry.name));
      const found = (savedId && entries.find(entry => entry.id === savedId && entry.type === column.type))
        || (named.length === 1 && named[0].type === column.type ? named[0] : null);
      if (found) columns[key] = { id: found.id, name: found.name };
      else if (named.length > 1) conflicts.push({ key, names: named.map(entry => entry.name), reason: "duplicate" });
      else if (named.length === 1) {
        conflicts.push({ key, names: [named[0].name], reason: "type", actualType: named[0].type, expectedType: column.type });
      } else absent.push(key);
    }

    const existingLanguage = Object.keys(columns)
      .map(key => Object.keys(COLUMNS[key].names).find(lang => COLUMNS[key].names[lang] === columns[key].name))
      .find(Boolean);
    const lang = languageOf(existingLanguage ?? saved?.language ?? language);
    const missing = {};
    const added = [];
    for (const key of absent) {
      const name = COLUMNS[key].names[lang];
      missing[name] = columnDefinition(key, lang);
      columns[key] = { id: name, name };
      added.push({ key, name, type: COLUMNS[key].type });
    }

    const statusEntry = entries.find(entry => entry.id === columns.processingStatus?.id);
    const options = (statusEntry?.property?.select?.options ?? []).filter(option => option?.name);
    const statusOptions = {};
    const absentOptions = [];
    for (const [key, option] of Object.entries(STATUS_OPTIONS)) {
      const savedId = saved?.statusOptions?.[key]?.id;
      const found = (savedId && options.find(item => item.id === savedId))
        || options.find(item => Object.values(option.names).includes(item.name));
      statusOptions[key] = found ? { id: String(found.id ?? ""), name: found.name } : { id: "", name: option.names[lang] };
      if (!found) absentOptions.push(key);
    }
    // An existing status column keeps every option it has (by id, so Notion does not recolor or rename it).
    if (statusEntry && absentOptions.length) {
      missing[statusEntry.name] = {
        select: {
          options: [
            ...options.map(option => (option.id ? { id: option.id } : { name: option.name })),
            ...statusOptionDefinitions(absentOptions, lang)
          ]
        }
      };
    }

    return {
      map: { dataSourceId: String(saved?.dataSourceId ?? ""), language: lang, columns, statusOptions },
      missing,
      added,
      addedOptions: statusEntry ? absentOptions.map(key => statusOptions[key].name) : [],
      conflicts
    };
  }

  // A page's (or data source's) entry for one column. Notion keys them by name but includes each
  // column's id, so the id still finds it after a rename; the name covers objects built without ids.
  function columnEntry(properties, column) {
    if (!properties || !column) return undefined;
    return Object.values(properties).find(value => value?.id === column.id) ?? properties[column.name];
  }

  // ---- Operations bound to one data source ----

  /**
   * Every payload builder and page reader that depends on column or option names, bound to one data
   * source's column map. Callers pass column and status keys only.
   */
  function bindColumns(columnMap) {
    const { columns, statusOptions } = columnMap;
    const propertyId = key => columns[key].id;
    // For the query string's filter_properties, which this extension has only ever sent names to.
    const propertyName = key => columns[key].name;
    const value = (page, key) => columnEntry(page?.properties, columns[key]);
    const plainList = (page, key) => richTextPlain(value(page, key)?.rich_text)
      .split(/[｜\n]+/u).map(shared.cleanText).filter(Boolean);
    const topicNames = page => (value(page, "aiTopics")?.multi_select ?? [])
      .map(item => shared.cleanText(item?.name)).filter(Boolean);

    function statusName(status) {
      if (!statusOptions[status]) throw new Error(`未知的整理狀態：${status}`);
      return statusOptions[status].name;
    }

    // The status key of a page, or "" when the column is empty or holds an option Siftly does not own.
    function statusKey(page) {
      const select = value(page, "processingStatus")?.select;
      if (!select) return "";
      return Object.keys(statusOptions).find(key => (select.id && statusOptions[key].id === select.id)
        || statusOptions[key].name === select.name) || "";
    }

    /**
     * Page PATCH after AI analysis. Writes AI 標題, AI 關鍵字, AI 摘要, and AI 暫定主題 (result.ai_topics
     * joined by ｜ — not confirmed AI 主題) plus the status. Batch analysis passes clearFinalTopics false
     * so confirmed AI 主題 is left unchanged. Single-page reanalysis passes true so AI 主題 is emptied,
     * invalidating previous confirmed topics beside the new provisionals.
     */
    function analysisDraftPayload(result, status = STATUS.topicOrganize, clearFinalTopics = false) {
      const properties = {
        [propertyId("aiTitle")]: { rich_text: richText(result.ai_title) },
        [propertyId("provisionalTopics")]: { rich_text: richText((result.ai_topics ?? []).join("｜")) },
        [propertyId("aiKeywords")]: { rich_text: richText((result.ai_keywords ?? []).join("｜")) },
        [propertyId("aiSummary")]: { rich_text: richText(result.ai_summary) },
        [propertyId("processingStatus")]: { select: { name: statusName(status) } }
      };
      if (clearFinalTopics) properties[propertyId("aiTopics")] = { multi_select: [] };
      return { properties };
    }

    // Full read for current-page inspection and single-page review, which show fields the organizer does not.
    function pagePropertyValues(page) {
      return {
        id: page?.id ?? "",
        title: pageTitle(page).slice(0, MAX_STORED_PAGE_TITLE_CHARACTERS),
        url: String(page?.url ?? "").slice(0, 2000),
        aiTitle: richTextPlain(value(page, "aiTitle")?.rich_text),
        aiTopics: topicNames(page),
        provisionalTopics: plainList(page, "provisionalTopics"),
        keywords: plainList(page, "aiKeywords"),
        status: statusKey(page)
      };
    }

    // Narrow read for organizer apply and rollback, so those loops depend on taxonomy and status only.
    function topicOrganizerPageValues(page) {
      return {
        id: page?.id ?? "",
        aiTopics: topicNames(page),
        provisionalTopics: plainList(page, "provisionalTopics"),
        status: statusKey(page)
      };
    }

    // Any existing AI value is protected, including partial results or whitespace.
    function isUnanalyzedArticle(page) {
      if (!page || page.archived || page.in_trash || page.is_archived) return false;
      const status = value(page, "processingStatus");
      if (status && ((status.type && status.type !== "select") || status.select != null)) return false;
      for (const key of AI_VALUE_KEYS) {
        const property = value(page, key);
        if (!property) continue;
        const type = COLUMNS[key].type;
        if (property.type && property.type !== type) return false;
        if (!Array.isArray(property[type]) || property[type].length > 0) return false;
      }
      return true;
    }

    function unanalyzedQueryPayload(startCursor = "", pageSize = 10) {
      const payload = {
        page_size: Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 10))),
        filter: {
          and: [
            { property: propertyId("processingStatus"), select: { is_empty: true } },
            ...AI_VALUE_KEYS.map(key => ({ property: propertyId(key), [COLUMNS[key].type]: { is_empty: true } }))
          ]
        },
        sorts: [{ timestamp: "created_time", direction: "descending" }]
      };
      if (startCursor) payload.start_cursor = startCursor;
      return payload;
    }

    /**
     * Page PATCH that always replaces confirmed AI 主題 from `topics` and writes the status. AI 暫定主題 is
     * replaced only when provisionalTopics is an array (including [] to clear it); a non-array (null, used
     * by rollback when current provisionals no longer match the snapshot) leaves it unchanged.
     */
    function topicApplyPayload(topics, status, existingTopicOptions = [], provisionalTopics = null) {
      const properties = {
        [propertyId("aiTopics")]: { multi_select: topicMultiSelect(topics, existingTopicOptions, topics) },
        [propertyId("processingStatus")]: { select: { name: statusName(status) } }
      };
      if (Array.isArray(provisionalTopics)) {
        properties[propertyId("provisionalTopics")] = { rich_text: richText(provisionalTopics.join("｜")) };
      }
      return { properties };
    }

    // Page PATCH that writes only the status.
    function statusUpdatePayload(status) {
      return { properties: { [propertyId("processingStatus")]: { select: { name: statusName(status) } } } };
    }

    function queryPayload(status, startCursor = "", pageSize = 100) {
      const payload = {
        page_size: Math.max(1, Math.min(100, Number(pageSize) || 100)),
        filter: { property: propertyId("processingStatus"), select: { equals: statusName(status) } },
        sorts: [{ timestamp: "created_time", direction: "ascending" }]
      };
      if (startCursor) payload.start_cursor = startCursor;
      return payload;
    }

    function topicOrganizerQueryPayload(startCursor = "", pageSize = 50) {
      const payload = {
        page_size: Math.max(1, Math.min(100, Number(pageSize) || 50)),
        filter: {
          and: [{
            or: [STATUS.topicOrganize, STATUS.topicReview].map(status => ({
              property: propertyId("processingStatus"),
              select: { equals: statusName(status) }
            }))
          }, {
            property: propertyId("provisionalTopics"),
            rich_text: { is_not_empty: true }
          }]
        },
        sorts: [{ timestamp: "created_time", direction: "ascending" }]
      };
      if (startCursor) payload.start_cursor = startCursor;
      return payload;
    }

    // The AI 主題 options of a data source's `properties`, deduplicated by topicKey.
    function topicOptions(properties = {}) {
      const options = columnEntry(properties, columns.aiTopics)?.multi_select?.options;
      const seen = new Set();
      return (Array.isArray(options) ? options : []).reduce((result, option) => {
        const name = shared.cleanText(option?.name);
        const key = topicKey(name);
        if (!name || !key || seen.has(key)) return result;
        seen.add(key);
        result.push({
          id: String(option?.id ?? ""),
          name,
          color: shared.cleanText(option?.color) || "default"
        });
        return result;
      }, []);
    }

    /**
     * Data-source PATCH for the AI 主題 option list. Preserves existing options by id (or name if id is
     * absent) and adds new topic names that are not already there by topicKey. Writes no page.
     */
    function topicOptionsUpdatePayload(existingOptions = [], newTopics = []) {
      const existingKeys = new Set(
        (existingOptions ?? []).map(option => topicKey(option?.name)).filter(Boolean)
      );
      const additions = [];
      for (const value of newTopics ?? []) {
        const name = shared.cleanText(value).slice(0, 100);
        const key = topicKey(name);
        if (!name || !key || existingKeys.has(key)) continue;
        existingKeys.add(key);
        additions.push({ name, color: topicColor(name) });
      }
      return {
        properties: {
          [propertyId("aiTopics")]: {
            multi_select: {
              options: [
                ...(existingOptions ?? []).filter(option => option?.name).map(option => option.id
                  ? { id: option.id }
                  : { name: shared.cleanText(option.name), color: option.color || "default" }),
                ...additions
              ]
            }
          }
        }
      };
    }

    return Object.freeze({
      columnMap,
      dataSourceId: columnMap.dataSourceId,
      analysisDraftPayload,
      isUnanalyzedArticle,
      pagePropertyValues,
      propertyId,
      propertyName,
      queryPayload,
      statusName,
      statusUpdatePayload,
      topicApplyPayload,
      topicOptions,
      topicOptionsUpdatePayload,
      topicOrganizerPageValues,
      topicOrganizerQueryPayload,
      unanalyzedQueryPayload
    });
  }

  // ---- Reading pages and blocks ----

  function richTextPlain(items) {
    return (items ?? []).map(item => {
      if (typeof item?.plain_text === "string") return item.plain_text;
      if (typeof item?.text?.content === "string") return item.text.content;
      if (typeof item?.equation?.expression === "string") return item.equation.expression;
      return "";
    }).join("");
  }

  /**
   * Reduces one Search API data_source result to the fields used by the
   * options-page picker. Invalid, trashed, or parentless objects are omitted;
   * external icon URLs, schema, descriptions, and user data are never copied.
   */
  function dataSourceSummary(dataSource) {
    if (!dataSource || typeof dataSource !== "object") return null;
    if (dataSource.object !== "data_source" || dataSource.in_trash === true) return null;
    const id = shared.extractNotionId(dataSource.id);
    const databaseId = shared.extractNotionId(dataSource.parent?.database_id);
    if (!id || !databaseId) return null;
    const titleItems = Array.isArray(dataSource.title) ? dataSource.title : [];
    const title = shared.cleanText(richTextPlain(titleItems)).slice(0, 200) || "未命名資料庫";
    const emoji = dataSource.icon?.type === "emoji" && typeof dataSource.icon.emoji === "string"
      ? dataSource.icon.emoji.slice(0, 16)
      : "";
    return { id, databaseId, title, emoji };
  }

  /**
   * Converts one Notion block into a plain-text record for the AI article.
   * Maps headings, lists, quotes, and similar types to a single cleaned line;
   * image/video/audio/file/pdf/unsupported are ignored. Does not walk children; the
   * caller recurses and passes depth for list indent. Returns null for a
   * non-object block.
   */
  function blockToRecord(block, depth = 0) {
    if (!block || typeof block !== "object") return null;
    const type = block.type;
    const data = block[type] ?? {};
    const indent = "  ".repeat(Math.max(0, depth));
    const text = richTextPlain(data.rich_text);
    let line = "";

    if (type === "paragraph") line = text;
    else if (/^heading_[123]$/.test(type)) line = `${"#".repeat(Number(type.slice(-1)))} ${text}`;
    else if (type === "bulleted_list_item") line = `${indent}- ${text}`;
    else if (type === "numbered_list_item") line = `${indent}1. ${text}`;
    else if (type === "to_do") line = `${indent}- [${data.checked ? "x" : " "}] ${text}`;
    else if (type === "toggle") line = `${indent}${text}`;
    else if (type === "quote") line = `${indent}> ${text}`;
    else if (type === "callout") line = text;
    else if (type === "code") line = text;
    else if (type === "equation") line = data.expression ?? "";
    else if (type === "divider") line = "---";
    else if (type === "bookmark") line = text || data.url || "";
    else if (type === "link_preview" || type === "embed") line = data.url || "";
    else if (type === "table_row") {
      line = (data.cells ?? []).map(richTextPlain).filter(Boolean).join(" | ");
    } else if (type === "child_page") line = data.title ? `## ${data.title}` : "";

    const ignoredMedia = ["image", "video", "audio", "file", "pdf", "unsupported"];
    return {
      ignored: ignoredMedia.includes(type),
      line: shared.cleanText(line),
      type
    };
  }

  function isCaptureMetadataLine(value) {
    const plain = shared.cleanText(value).replace(/^#{1,3}\s*/, "");
    return plain === "擷取提醒"
      || /^⚠️/u.test(plain)
      || plain === "此貼文沒有可擷取的內容。"
      || plain === "此則回覆沒有可擷取的內容。"
      || plain === "附件沒有可擷取的文字。";
  }

  /**
   * Joins blockToRecord lines into the normalized article string the AI layer
   * receives. Drops ignored records, empty lines, and capture-extension
   * metadata (擷取提醒 and empty-content notices). Consecutive dividers
   * collapse to one. Does not read Notion properties or call AI.
   */
  function buildArticleText(records) {
    const lines = [];
    for (const record of records ?? []) {
      if (!record || record.ignored) continue;
      const line = shared.cleanText(typeof record === "string" ? record : record.line);
      if (!line || isCaptureMetadataLine(line)) continue;
      if (line === "---") {
        if (lines.length && lines.at(-1) !== "---") lines.push(line);
      } else {
        lines.push(line);
      }
    }
    return shared.cleanText(lines.join("\n\n"));
  }

  function pageTitle(page) {
    for (const property of Object.values(page?.properties ?? {})) {
      if (propertyType(property) === "title") {
        const title = richTextPlain(property.title);
        if (title) return shared.cleanText(title);
      }
    }
    return "未命名文章";
  }

  function pageSummary(page) {
    return {
      id: page?.id ?? "",
      title: pageTitle(page).slice(0, MAX_STORED_PAGE_TITLE_CHARACTERS),
      url: String(page?.url ?? "").slice(0, 2000),
      lastEditedTime: page?.last_edited_time ?? ""
    };
  }

  return Object.freeze({
    API_VERSION,
    COLUMNS,
    MAX_STORED_PAGE_TITLE_CHARACTERS,
    PROPERTY_NAMES,
    STATUS,
    STATUS_NAMES,
    STATUS_OPTIONS,
    allPagesQueryPayload,
    analysisPropertySchema,
    bindColumns,
    blockToRecord,
    buildArticleText,
    dataSourceSearchPayload,
    dataSourceSummary,
    defaultColumnMap,
    isCaptureMetadataLine,
    pageSummary,
    propertyType,
    resolveColumnMap,
    richText,
    richTextPlain,
    topicColor,
    topicKey,
    topicMultiSelect
  });
});
