/**
 * Retakes the Chrome Web Store screenshots (store/screenshots/<zh-TW|en>/01-results … 05-setup, 1280x800 each)
 * and the small promo tile (store/promo/small-tile-<zh-TW|en>.png, 440x280).
 *
 * Serves the project folder as a website, loads the real popup.html and options.html with a fake chrome API
 * (mock.js) and demo data, lays each one out next to its headline (compose.html) and photographs it with
 * headless Chrome. It does not touch the extension's code and is not part of the extension package.
 *
 * Usage: node scripts/store-screenshots/index.js   (set CHROME_PATH when Chrome is not in its usual place)
 */
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "store", "screenshots");
const PROMO_OUT = path.join(ROOT, "store", "promo");
const LANGUAGES = [["zh", "zh-TW"], ["en", "en"]];
const SCENES = ["results", "popup", "review", "organizer", "setup"];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

// ---- Local server ----

// The extension's pages get mock.js first, so `chrome` exists before their own scripts run.
const EXTENSION_PAGE = /^\/(?:popup|options)\.html$/;

function serve(request, response) {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const file = ["/mock.js", "/compose.html", "/promo.html"].includes(pathname)
    ? path.join(__dirname, pathname)
    : path.join(ROOT, pathname);
  if (!path.resolve(file).startsWith(ROOT)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    const body = EXTENSION_PAGE.test(pathname)
      ? String(data).replace("<head>", '<head><script src="/mock.js"></script>')
      : data;
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  });
}

// ---- Chrome ----

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
  ];
  const found = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH to the Chrome executable.");
  return found;
}

// Not execFileSync: the server above has to keep answering while Chrome runs.
function shoot(chromePath, url, file, profile, size = "1280,800") {
  return run(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${size}`,
    // Lets the page finish its own timers (the popup's refresh, the settings page's scroll) before the shot.
    "--virtual-time-budget=6000",
    `--user-data-dir=${profile}`,
    `--screenshot=${file}`,
    url
  ]);
}

// ---- Run ----

const chromePath = findChrome();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "siftly-screenshots-"));
const server = http.createServer(serve).listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  try {
    for (const [language, folder] of LANGUAGES) {
      fs.mkdirSync(path.join(OUT, folder), { recursive: true });
      for (const [index, scene] of SCENES.entries()) {
        const file = path.join(OUT, folder, `0${index + 1}-${scene}.png`);
        await shoot(chromePath, `http://127.0.0.1:${port}/compose.html?lang=${language}&scene=${scene}`, file, profile);
        console.log(path.relative(ROOT, file));
      }
    }
    // The store takes one small promo tile (440x280) per listing language; Chinese is the default listing.
    fs.mkdirSync(PROMO_OUT, { recursive: true });
    for (const [language, folder] of LANGUAGES) {
      const tile = path.join(PROMO_OUT, `small-tile-${folder}.png`);
      await shoot(chromePath, `http://127.0.0.1:${port}/promo.html?lang=${language}`, tile, profile, "440,280");
      console.log(path.relative(ROOT, tile));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
