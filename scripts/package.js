/**
 * Packs the files the extension needs at runtime into dist/siftly-v<version>.zip, ready to upload to the
 * Chrome Web Store. Leaves out tests, scripts, docs and store assets. Does not change any source file.
 *
 * RUNTIME_ENTRIES is a hand-kept list: a new runtime file or folder has to be added there, or it will be
 * missing from the zip. Windows only (tar.exe, with a PowerShell fallback).
 *
 * Usage: npm run package
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const VERSION = MANIFEST.version;
const DIST = path.join(ROOT, "dist");
const OUTPUT_ZIP = path.join(DIST, `siftly-v${VERSION}.zip`);

const RUNTIME_ENTRIES = [
  "manifest.json",
  "background.js",
  "background",
  "gemini.js",
  "notion.js",
  "prompt.js",
  "shared.js",
  "ui-select.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "options.html",
  "options.css",
  "options.js",
  "i18n",
  "_locales",
  "assets/icons/icon16.png",
  "assets/icons/icon32.png",
  "assets/icons/icon48.png",
  "assets/icons/icon128.png",
  "LICENSE"
];

function main() {
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }

  if (fs.existsSync(OUTPUT_ZIP)) {
    fs.unlinkSync(OUTPUT_ZIP);
  }

  // Use Windows built-in tar (bsdtar) to pack zip without dev dependencies
  try {
    execFileSync("tar.exe", ["-a", "-c", "-f", OUTPUT_ZIP, ...RUNTIME_ENTRIES], {
      cwd: ROOT,
      stdio: "inherit"
    });
  } catch {
    // Fallback to powershell Compress-Archive
    const stagingDir = path.join(DIST, "staging");
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    for (const entry of RUNTIME_ENTRIES) {
      const src = path.join(ROOT, entry);
      const dest = path.join(stagingDir, entry);
      fs.cpSync(src, dest, { recursive: true });
    }

    execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${stagingDir}/*' -DestinationPath '${OUTPUT_ZIP}' -Force`
    ], { stdio: "inherit" });

    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  const stat = fs.statSync(OUTPUT_ZIP);
  const sizeKb = (stat.size / 1024).toFixed(1);
  console.log(`Package created successfully: ${path.relative(ROOT, OUTPUT_ZIP)} (${sizeKb} KB)`);
}

main();
