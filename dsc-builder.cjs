#!/usr/bin/env node
"use strict";
/*
  DSC server.cjs builder
  Share this whole folder. Edit settings.json and plugins.js.

  Windows:  start.bat     or    node dsc-builder.cjs
  Linux:    ./start.sh    or    node dsc-builder.cjs
  No window: node dsc-builder.cjs --build
*/
const fs = require("fs");
const http = require("http");
const path = require("path");
const { exec } = require("child_process");
const { locateSource, scanServer, buildInto } = require("./lib.js");

const ROOT = __dirname;
const SETTINGS_FILE = path.join(ROOT, "settings.json");
const PAGE = fs.readFileSync(path.join(ROOT, "page.html"));

function loadSettings() {
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}
function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

function headless() {
  const settings = loadSettings();
  const fromGame = process.argv.includes("--from-game");
  const result = buildInto(settings, fromGame);
  console.log("Wrote", result.dest);
  if (result.backup) console.log("Backup", result.backup);
  console.log("From", result.source);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function send(res, code, body, type) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Content-Length": data.length });
  res.end(data);
}

function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        send(res, 200, PAGE, "text/html; charset=utf-8");
        return;
      }
      if (req.method === "GET" && url.pathname === "/splash.jpg") {
        send(res, 200, fs.readFileSync(path.join(ROOT, "splash.jpg")), "image/jpeg");
        return;
      }
      if (req.method === "GET" && url.pathname === "/logo.png") {
        send(res, 200, fs.readFileSync(path.join(ROOT, "logo.png")), "image/png");
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/settings") {
        send(res, 200, loadSettings());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/scan") {
        const body = await readBody(req);
        saveSettings(body.settings);
        const source = locateSource(body.settings, !!body.fromGame);
        if (!source) { send(res, 200, { error: "No server.cjs in the server folder or the game install." }); return; }
        const report = scanServer(fs.readFileSync(source, "utf8"));
        send(res, 200, { source, report });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/build") {
        const body = await readBody(req);
        saveSettings(body.settings);
        const result = buildInto(body.settings, !!body.fromGame);
        send(res, 200, result);
        return;
      }
      send(res, 404, { error: "Not found" });
    } catch (err) {
      send(res, 200, { error: err && err.message ? err.message : String(err) });
    }
  });
  server.listen(8787, "127.0.0.1", () => {
    const url = "http://127.0.0.1:8787";
    console.log("DSC server builder");
    console.log(url);
    console.log("Edit settings.json and plugins.js in this folder, then use the page or run: node dsc-builder.cjs --build");
    const cmd = process.platform === "win32" ? "start \"\" \"" + url + "\"" : process.platform === "darwin" ? "open \"" + url + "\"" : "xdg-open \"" + url + "\"";
    exec(cmd, { windowsHide: true }, () => {});
  });
}

if (process.argv.includes("--build")) headless();
else serve();
