/**
 * Interface language: `t()` looks a Chinese string up in the English dictionary (i18n/en.js), and
 * `translateDocument()` does the same for the static text of the extension pages.
 *
 * Chinese is the source language, so a string with no English entry shows in Chinese instead of blank.
 * Covers interface text only. AI output language, prompts, and the names of Notion columns and status
 * options are decided elsewhere (prompt.js, notion.js) and never pass through here.
 */
(function attachAnalyzerI18n(root, factory) {
  const english = typeof module === "object" && module.exports
    ? require("./en.js")
    : root.AnalyzerI18nEnglish;
  const api = factory(english ?? {});
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AnalyzerI18n = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAnalyzerI18n(english) {
  "use strict";

  const LANGUAGES = Object.freeze(["zh", "en"]);
  let language = "zh";

  function setLanguage(value) {
    language = LANGUAGES.includes(value) ? value : "zh";
    return language;
  }

  function getLanguage() {
    return language;
  }

  // Placeholders look like {count} and are filled from `params`.
  function fill(text, params) {
    return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text;
  }

  // Translates a Chinese string into the current language and fills its {placeholders}.
  function t(text, params) {
    const key = String(text ?? "");
    return fill(language === "en" && english[key] !== undefined ? english[key] : key, params);
  }

  function normalizeSpace(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  // Attributes whose text people see or hear.
  const TEXT_ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"];

  // Static page text: every text node and text attribute is looked up by its Chinese wording.
  function translateDocument(doc) {
    if (language !== "en" || !doc) return;
    const walker = doc.createTreeWalker(doc, 4 /* SHOW_TEXT */);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (/^(?:SCRIPT|STYLE)$/.test(node.parentNode?.nodeName ?? "")) continue;
      // translate="no" marks text that reads the same in every language, such as a language's own name.
      if (node.parentElement?.closest('[translate="no"]')) continue;
      const original = node.nodeValue ?? "";
      const key = normalizeSpace(original);
      if (!key || english[key] === undefined) continue;
      const lead = /^\s*/.exec(original)?.[0] ?? "";
      const tail = /\s*$/.exec(original)?.[0] ?? "";
      node.nodeValue = `${lead}${english[key]}${tail}`;
    }
    for (const element of doc.querySelectorAll("*")) {
      for (const name of TEXT_ATTRIBUTES) {
        const key = normalizeSpace(element.getAttribute(name));
        if (key && english[key] !== undefined) element.setAttribute(name, english[key]);
      }
    }
    doc.documentElement?.setAttribute("lang", "en");
  }

  // The language saved in the extension config. Pages call this before they build any text.
  async function loadFromStorage(chromeApi, configKey) {
    let saved = "zh";
    try {
      saved = (await chromeApi.storage.local.get(configKey))?.[configKey]?.uiLanguage ?? "zh";
    } catch {
      // Storage is not readable here; the page stays in the source language.
    }
    return setLanguage(saved);
  }

  return Object.freeze({ LANGUAGES, getLanguage, loadFromStorage, setLanguage, t, translateDocument });
});
