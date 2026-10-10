/**
 * Page bootstrap for options.html and popup.html: loads the saved interface language, translates the
 * static page, and only then runs the page's own scripts (listed in this tag's data-scripts), so every
 * script reads and builds text in the right language from its first line.
 *
 * Does nothing else; the page scripts own all behavior.
 */
(function startPage() {
  "use strict";

  const CONFIG_KEY = "notionAiAnalyzerConfig";
  const scripts = (document.currentScript?.dataset.scripts ?? "").split(",").map(name => name.trim()).filter(Boolean);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.body.append(script);
    });
  }

  (async () => {
    await globalThis.AnalyzerI18n.loadFromStorage(chrome, CONFIG_KEY);
    globalThis.AnalyzerI18n.translateDocument(document);
    // In order: later scripts use globals the earlier ones define.
    for (const src of scripts) await loadScript(src);
  })();
})();
