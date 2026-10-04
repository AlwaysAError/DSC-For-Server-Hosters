"use strict";
const fs = require("fs");
const path = require("path");
const PLUGIN_BUNDLE = require("./plugins.js");

const MARKERS = [
  "function dscSrc(fn)",
  "DSC plugin binder",
  "(function dscChatToDiscord",
  "(function dscCustomLevels",
  "(function dscTooltips",
  "(function dscWebChat",
  "(function dscMatchBoard",
  "(function dscRanksBoard",
  "(function dscLiveMinimap",
  "(function dscStatsPage",
  "(function dscBotMods",
  "(function dscMaxBots",
  "(function dscTextCommands",
  "(function dscWeaponBuilder",
];

function matchBrace(src, openIndex) {
  let depth = 0;
  let quote = null;
  let esc = false;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractFunctions(src) {
  const out = [];
  const re = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const paren = src.indexOf("(", m.index);
    let i = paren + 1;
    let depth = 1;
    let quote = null;
    let esc = false;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (quote) {
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    const brace = src.indexOf("{", i - 1);
    if (brace < 0) continue;
    const end = matchBrace(src, brace);
    if (end < 0) continue;
    out.push({ name, body: src.slice(m.index, end + 1) });
    re.lastIndex = end + 1;
  }
  return out;
}

function shortest(list) {
  if (!list.length) return null;
  return list.slice().sort((a, b) => a.body.length - b.body.length)[0];
}

function scanServer(src) {
  const fns = extractFunctions(src);
  const chats = fns.filter((x) => x.body.length < 1500 && x.body.includes("chat") && x.body.includes("emit"));
  const lobbyChat = shortest(chats.filter((x) => x.body.includes(".to(")));
  const worldChat =
    shortest(chats.filter((x) => x !== lobbyChat && x.body.includes('of("/")'))) ||
    shortest(chats.filter((x) => x !== lobbyChat && !x.body.includes(".to(") && (x.body.includes('emit("chat"') || x.body.includes("emit('chat'"))));
  const dm = shortest(fns.filter((x) => x !== worldChat && x !== lobbyChat && x.body.length < 400 && !x.body.includes(".to(") && !x.body.includes('of("/")') && (x.body.includes('.emit("chat"') || x.body.includes(".emit('chat'"))));
  const commands = shortest(fns.filter((x) => x.body.includes("handleChatCommand") && x.body.length < 12000));
  const join = fns.filter((x) => {
    const s = x.body;
    if (s.includes("welcomeMessage") || s.includes("PLAYER-NAME")) return true;
    if (s.includes("bInit=!0") && (s.includes("maxPlayers") || s.includes("isBanned") || s.includes("logged in"))) return true;
    if (s.includes("lobbyUpdated") && (s.includes("players.push") || s.includes(".players.push"))) return true;
    return false;
  });
  const botFactory = shortest(fns.filter((x) => x.body.length < 900 && x.body.includes("bBot:!0") && x.body.includes("botSkill")));
  const botFill = shortest(fns.filter((x) => x.body.includes("bBot") && x.body.includes("survival") && x.body.includes("push") && x.body.length < 2500));
  const teamPick = shortest(fns.filter((x) => x.body.length < 700 && x.body.includes("deathmatch") && x.body.includes("team===0") && x.body.includes("team===1")));
  const lobbyGet = shortest(fns.filter((x) => x.body.length < 600 && (x.body.includes(".id===") || x.body.includes(".id==")) && x.body.includes("players")));
  const strip = fns.find((x) => x.name === "ii") || shortest(fns.filter((x) => x.body.length < 400 && x.body.includes("replace") && x.body.includes("[")));
  const socketOf = fns.find((x) => x.name === "hr") || shortest(fns.filter((x) => x.body.length < 400 && x.body.includes(".data") && x.body.includes(".id===")));
  const count = fns.find((x) => x.name === "ni") || shortest(fns.filter((x) => x.body.length < 300 && x.body.includes("bInit")));
  const game = src.match(/new\s+([A-Za-z_$][\w$]*)\s*\(\s*G\.tickRate\s*\)/);
  const char = src.match(/([A-Za-z_$][\w$]*)\.prototype\.initializeAI\s*=/);
  const lobbies = src.match(/([A-Za-z_$][\w$]*)\s*\[\s*0\s*\]\s*\?\.bLocked/);
  return {
    game: game ? game[1] : null,
    char: char ? char[1] : null,
    lobbyChat: lobbyChat ? lobbyChat.name : null,
    worldChat: worldChat ? worldChat.name : null,
    dm: dm ? dm.name : null,
    commands: commands ? commands.name : null,
    join: [...new Set(join.map((j) => j.name))],
    botFactory: botFactory ? botFactory.name : null,
    botFill: botFill ? botFill.name : null,
    teamPick: teamPick ? teamPick.name : null,
    lobbyGet: lobbyGet ? lobbyGet.name : null,
    strip: strip ? strip.name : null,
    socketOf: socketOf ? socketOf.name : null,
    count: count ? count.name : null,
    lobbies: lobbies ? lobbies[1] : null,
    looksLikeServer: src.includes("G.tickRate") || src.includes("socket.io") || src.includes("bBot"),
  };
}

function stripPlugins(src) {
  let cut = -1;
  for (const marker of MARKERS) {
    const i = src.indexOf(marker);
    if (i >= 0 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut < 0) return src.replace(/\s*$/, "\n");
  const line = src.lastIndexOf("\n", cut);
  return src.slice(0, line < 0 ? 0 : line + 1).replace(/\s*$/, "\n");
}

function sliceIife(src, name) {
  const start = src.indexOf("(function " + name);
  if (start < 0) return "";
  const brace = src.indexOf("{", start);
  const end = matchBrace(src, brace);
  if (end < 0) return "";
  let i = end + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src.startsWith(")();", i) || src.startsWith(")()", i)) {
    const semi = src.indexOf(";", i);
    return src.slice(start, (semi < 0 ? i + 3 : semi) + 1);
  }
  return src.slice(start, end + 1);
}

function patchDiscord(block, settings) {
  const d = settings.discord;
  let out = block.replace(
    /const DISCORD_WEBHOOK_URL =\s*\n?\s*\(typeof G[\s\S]*?\|\| "";/,
    "const DISCORD_WEBHOOK_URL =\n        (typeof G !== \"undefined\" && (G.discordWebhook || G.discordWebhookUrl)) || " + JSON.stringify(d.webhook) + ";",
  );
  out = out.replace(/const IGNORE_COMMANDS = (?:true|false);/, "const IGNORE_COMMANDS = " + !!d.ignoreCommands + ";");
  out = out.replace(/const IGNORE_SERVER_MESSAGES = (?:true|false);/, "const IGNORE_SERVER_MESSAGES = " + !!d.ignoreServerMessages + ";");
  out = out.replace(/const MIN_INTERVAL_MS = \d+;/, "const MIN_INTERVAL_MS = " + Math.max(0, d.minIntervalMs | 0) + ";");
  const expr = String(d.messageTemplate || "")
    .split(/(\{user\}|\{message\})/g)
    .map((part) => (part === "{user}" ? "playerUsername(chat)" : part === "{message}" ? "sanitize(chat.message)" : JSON.stringify(part)))
    .join(" + ");
  out = out.replace(
    /const body = \{ allowed_mentions: \{ parse: \[\] \}, content: \([\s\S]*?\)\.slice\(0, 2000\) \};/,
    "const body = { allowed_mentions: { parse: [] }, content: ((" + expr + ").slice(0, 2000)) };",
  );
  return out;
}

function replaceObject(src, decl, value) {
  const at = src.indexOf(decl);
  if (at < 0) return src;
  const brace = src.indexOf("{", at);
  const end = matchBrace(src, brace);
  if (end < 0) return src;
  return src.slice(0, at) + decl + JSON.stringify(value, null, 4) + src.slice(end + 1);
}

function matchBracket(src, openIndex) {
  let depth = 0;
  let quote = null;
  let esc = false;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function replaceArray(src, decl, value) {
  const at = src.indexOf(decl);
  if (at < 0) return src;
  const brace = src.indexOf("[", at);
  const end = matchBracket(src, brace);
  if (end < 0) return src;
  return src.slice(0, at) + decl + JSON.stringify(value, null, 4) + src.slice(end + 1);
}

function cleanRanks(rows) {
  return (rows || [])
    .filter((row) => row && String(row.name || "").trim())
    .map((row) => ({ minXp: Number(row.minXp) || 0, name: String(row.name).trim() }))
    .sort((a, b) => a.minXp - b.minXp);
}

function patchRanks(block, settings) {
  const r = settings.ranks || {};
  return replaceObject(block, "const DEFAULT_CFG = ", {
    statsFile: String(r.statsFile || "").trim() || "dsc_levels.json",
    xpKill: r.xpKill, xpAssist: r.xpAssist, xpWin: r.xpWin, xpDeath: r.xpDeath, xpLoss: r.xpLoss, xpTeamHit: r.xpTeamHit,
    teamHitCooldownMs: r.teamHitCooldownMs,
    levelUpMessage: r.levelUpMessage, demoteMessage: r.demoteMessage,
    displayMode: r.displayMode, prefixFormat: r.prefixFormat,
    ranks: cleanRanks(r.ranks),
  });
}

function patchTips(block, settings) {
  const tips = ((settings.tips && settings.tips.tips) || [])
    .map((tip) => ({ message: String((tip && tip.message) || ""), delaySeconds: Math.max(1, Number(tip && tip.delaySeconds) || 60) }))
    .filter((tip) => tip.message.trim());
  return replaceArray(block, "const TIPS = ", tips);
}

function patchWebChat(block, settings) {
  const ms = Math.max(0, ((settings.webchat && settings.webchat.chatCooldownMs) || 0) | 0);
  return block.replace(/const CHAT_COOLDOWN_MS = \d+;/, "const CHAT_COOLDOWN_MS = " + ms + ";");
}

function patchMatch(block, settings) {
  const m = settings.match || {};
  return block
    .replace(/const HIDE_PLAYERS = false;/, "const HIDE_PLAYERS = " + !!m.hidePlayers + ";")
    .replace(/const HIDE_BOTS = false;/, "const HIDE_BOTS = " + !!m.hideBots + ";");
}

function patchRankboard(block, settings) {
  const file = JSON.stringify(String((settings.ranks && settings.ranks.statsFile) || "").trim() || "dsc_levels.json");
  const mode = settings.rankboard && (settings.rankboard.statsView === "custom" || settings.rankboard.statsView === "official") ? settings.rankboard.statsView : "both";
  return block
    .replace(/const STATS_FILE = "dsc_levels\.json";/, "const STATS_FILE = " + file + ";")
    .replace(/const BOARD_MODE = "both";/, "const BOARD_MODE = " + JSON.stringify(mode) + ";");
}

function patchMinimap(block, settings) {
  const gamePath = JSON.stringify(String((settings.map && settings.map.gamePath) || settings.gamePath || "").trim());
  return block.replace(/const GAME_PATH = "";/, "const GAME_PATH = " + gamePath + ";");
}

function cleanCommands(rows) {
  const out = [];
  const seen = new Set();
  (rows || []).forEach((row) => {
    let cmd = String((row && row.command) || "").trim();
    if (!cmd) return;
    if (cmd.charAt(0) !== "/") cmd = "/" + cmd;
    const key = cmd.toLowerCase();
    if (seen.has(key)) return;
    const text = String((row && row.text) || "");
    if (!text.trim()) return;
    seen.add(key);
    out.push({ command: cmd, text: text });
  });
  return out;
}

function patchCommands(block, settings) {
  const rows = settings.commands && settings.commands.commands;
  return replaceArray(block, "const COMMANDS = ", cleanCommands(rows));
}

const WEAPON_NUMS = ["damage","rpm","fireRate","accuracy","recoil","recoilMultiplier","range","radius","penetration","gravityScale","mobility","aimZoom","boltDelayTime","damageType","burstRate","numBursts","magSize","mag","ammo","maxAmmo","reloadTime","animX","animY","animOffsetX","animOffsetY","leftHandAngle","rightHandAngle"];
const WEAPON_STRS = ["name","fireMode","round","soundId","reloadStartSoundId","type","categoryType","leftHand","rightHand"];
const WEAPON_BOOLS = ["bSingleRoundLoaded","bBoltAction","bPumpAction","bLeverAction","bRevolver","bTopLoaded","bBullpup","bSilenced","bCanLockOn","bRequireLockOn","bSmallLaser","bLayerRightHandBack","bLayerFront","bLayerSlideBack","bLayerLaserBack","bDisableWalkingAnimation","bAnimTopLoaded"];

function cleanWeapons(rows) {
  const out = [];
  const seen = new Set();
  (rows || []).forEach((row) => {
    let cmd = String((row && row.command) || "").trim();
    if (!cmd) return;
    if (cmd.charAt(0) !== "/") cmd = "/" + cmd;
    const key = cmd.toLowerCase();
    const baseId = String((row && row.baseId) || "").trim();
    if (!baseId || seen.has(key)) return;
    seen.add(key);
    const item = { command: cmd, baseId: baseId };
    WEAPON_NUMS.forEach((name) => {
      const raw = row[name];
      if (raw == null || String(raw).trim() === "") return;
      const n = Number(raw);
      if (Number.isFinite(n)) item[name] = n;
    });
    WEAPON_STRS.forEach((name) => {
      const s = String(row[name] || "").trim();
      if (s) item[name] = s;
    });
    WEAPON_BOOLS.forEach((name) => {
      if (row[name] === "on" || row[name] === true) item[name] = true;
      else if (row[name] === "off" || row[name] === false) item[name] = false;
    });
    const anims = {};
    if (typeof item.animX === "number") anims.x = item.animX;
    if (typeof item.animY === "number") anims.y = item.animY;
    if (typeof item.leftHand === "string") anims.leftHand = item.leftHand;
    if (typeof item.rightHand === "string") anims.rightHand = item.rightHand;
    if (typeof item.leftHandAngle === "number") anims.leftHandAngle = item.leftHandAngle;
    if (typeof item.rightHandAngle === "number") anims.rightHandAngle = item.rightHandAngle;
    if (typeof item.bSmallLaser === "boolean") anims.bSmallLaser = item.bSmallLaser;
    if (typeof item.bLayerRightHandBack === "boolean") anims.bLayerRightHandBack = item.bLayerRightHandBack;
    if (typeof item.bLayerFront === "boolean") anims.bLayerFront = item.bLayerFront;
    if (typeof item.bLayerSlideBack === "boolean") anims.bLayerSlideBack = item.bLayerSlideBack;
    if (typeof item.bLayerLaserBack === "boolean") anims.bLayerLaserBack = item.bLayerLaserBack;
    if (typeof item.bDisableWalkingAnimation === "boolean") anims.bDisableWalkingAnimation = item.bDisableWalkingAnimation;
    if (typeof item.bAnimTopLoaded === "boolean") anims.bTopLoaded = item.bAnimTopLoaded;
    const offset = {};
    if (typeof item.animOffsetX === "number") offset.x = item.animOffsetX;
    if (typeof item.animOffsetY === "number") offset.y = item.animOffsetY;
    if (Object.keys(offset).length) anims.offset = offset;
    ["animX","animY","animOffsetX","animOffsetY","leftHand","rightHand","leftHandAngle","rightHandAngle","bSmallLaser","bLayerRightHandBack","bLayerFront","bLayerSlideBack","bLayerLaserBack","bDisableWalkingAnimation","bAnimTopLoaded"].forEach((extra) => delete item[extra]);
    if (Object.keys(anims).length) item.anims = anims;
    out.push(item);
  });
  return out;
}

function patchWeapons(block, settings) {
  return replaceArray(block, "const WEAPONS = ", cleanWeapons(settings.weapons && settings.weapons.weapons));
}

function patchMaxBots(block, settings) {
  const n = Number(settings.bots && settings.bots.MaxSurvivalBots);
  const cap = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
  return block.replace(/const MAX_SURVIVAL_BOTS = \d+;/, "const MAX_SURVIVAL_BOTS = " + cap + ";");
}

function patchBots(block, settings) {
  const b = settings.bots;
  let out = replaceObject(block, "const DEFAULTS = ", {
    clanFormat: b.clanFormat || "BOT {difficulty}",
    MaxSurvivalBots: b.MaxSurvivalBots,
    rageEnabled: b.rageEnabled,
    rageNames: (b.rageNames || []).map((n) => String(n).trim()).filter(Boolean),
    ragePerksEnabled: b.ragePerksEnabled,
    ragePerks: (b.ragePerks || []).map((n) => String(n).trim()).filter(Boolean),
    rageAutoSpawn: b.rageAutoSpawn,
    survivalAllyRage: b.survivalAllyRage,
    rageLevel: b.rageLevel,
    ragePrestige: b.ragePrestige,
  });
  out = out.replace(
    `        if (skill >= 6) {
            p.level = 100;
            p.prestige = Math.max(p.prestige || 0, 10);
            if (!p._rageNamed) { p.name = pickRageName(); p._rageNamed = true; }
        }`,
    `        if (skill >= 6) {
            const lv = Number(CFG.rageLevel);
            const pr = Number(CFG.ragePrestige);
            p.level = Number.isFinite(lv) ? lv : 999;
            p.prestige = Number.isFinite(pr) ? pr : 999;
            if (!p._rageNamed) { p.name = pickRageName(); p._rageNamed = true; }
        }`,
  );
  return out;
}

function hookName(name) {
  return typeof name === "string" && /^[A-Za-z_$][\w$]*$/.test(name) ? name : null;
}

function patchHooks(binder, report) {
  if (!report || binder.indexOf("const DSC_HOOKS = null;") < 0) return binder;
  const join = Array.isArray(report.join) ? report.join.map(hookName).filter(Boolean) : [];
  const hooks = {
    game: hookName(report.game),
    char: hookName(report.char),
    lobbyChat: hookName(report.lobbyChat),
    worldChat: hookName(report.worldChat),
    dm: hookName(report.dm),
    commands: hookName(report.commands),
    join: join,
    botFactory: hookName(report.botFactory),
    botFill: hookName(report.botFill),
    teamPick: hookName(report.teamPick),
    lobbyGet: hookName(report.lobbyGet),
    strip: hookName(report.strip),
    socketOf: hookName(report.socketOf),
    count: hookName(report.count),
    lobbies: hookName(report.lobbies),
  };
  return binder.replace("const DSC_HOOKS = null;", "const DSC_HOOKS = " + JSON.stringify(hooks) + ";");
}

function assemblePlugins(settings, report) {
  const binderEnd = PLUGIN_BUNDLE.indexOf("(function dscChatToDiscord");
  const binder = patchHooks(PLUGIN_BUNDLE.slice(0, binderEnd).replace(/\s*$/, "\n"), report);
  const chunks = [binder];
  const on = settings.plugins || {};
  if (on.discord) chunks.push(patchDiscord(sliceIife(PLUGIN_BUNDLE, "dscChatToDiscord"), settings));
  if (on.ranks) chunks.push(patchRanks(sliceIife(PLUGIN_BUNDLE, "dscCustomLevels"), settings));
  if (on.tips) chunks.push(patchTips(sliceIife(PLUGIN_BUNDLE, "dscTooltips"), settings));
  if (on.map) chunks.push(patchMinimap(sliceIife(PLUGIN_BUNDLE, "dscLiveMinimap"), settings));
  if (on.match) chunks.push(patchMatch(sliceIife(PLUGIN_BUNDLE, "dscMatchBoard"), settings));
  if (on.webchat) chunks.push(patchWebChat(sliceIife(PLUGIN_BUNDLE, "dscWebChat"), settings));
  if (on.rankboard) chunks.push(patchRankboard(sliceIife(PLUGIN_BUNDLE, "dscRanksBoard"), settings));
  chunks.push(patchMaxBots(sliceIife(PLUGIN_BUNDLE, "dscMaxBots"), settings));
  if (on.bots) chunks.push(patchBots(sliceIife(PLUGIN_BUNDLE, "dscBotMods"), settings));
  if (on.commands) chunks.push(patchCommands(sliceIife(PLUGIN_BUNDLE, "dscTextCommands"), settings));
  if (on.weapons) chunks.push(patchWeapons(sliceIife(PLUGIN_BUNDLE, "dscWeaponBuilder"), settings));
  return chunks.filter(Boolean).join("\n\n") + "\n";
}

function findGameServer(gamePath) {
  if (!gamePath) return null;
  const list = [
    path.join(gamePath, "server.cjs"),
    path.join(gamePath, "MultiplayerServer", "server.cjs"),
    path.join(gamePath, "dsc-mp-custom", "server.cjs"),
    path.join(gamePath, "Deadswitch Combat Multiplayer Server", "server.cjs"),
  ];
  for (const file of list) if (fs.existsSync(file)) return file;
  return null;
}

function installPath(settings) {
  const map = settings.map || {};
  return String(map.gamePath || settings.gamePath || "").trim();
}

function locateSource(settings, fromGame) {
  const dir = String(settings.serverDir || "").trim();
  const dest = dir ? path.join(dir, "server.cjs") : "";
  if (!fromGame && dest && fs.existsSync(dest)) return dest;
  const found = findGameServer(installPath(settings));
  if (found) return found;
  if (dest && fs.existsSync(dest)) return dest;
  return null;
}

function buildInto(settings, fromGame) {
  const dir = String(settings.serverDir || "").trim();
  if (!dir) throw new Error("Server folder is empty.");
  const source = locateSource(settings, fromGame);
  if (!source) throw new Error("No server.cjs in the server folder or the game install.");
  const src = fs.readFileSync(source, "utf8");
  const report = scanServer(src);
  const out = stripPlugins(src).replace(/\s*$/, "\n") + "\n" + assemblePlugins(settings, report);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "server.cjs");
  let backup = null;
  if (fs.existsSync(dest)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backup = dest + ".bak-" + stamp;
    fs.copyFileSync(dest, backup);
  }
  fs.writeFileSync(dest, out);
  return { dest, source, backup, report };
}

module.exports = { scanServer, locateSource, buildInto, findGameServer };
