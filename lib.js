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
  "(function dscMaxMoney",
  "(function dscTextCommands",
  "(function dscWeaponBuilder",
  "(function dscAntiAfk",
  "(function dscMiniGames",
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

function findCharClass(src) {
  const ai = src.indexOf("initializeAI");
  if (ai < 0) return null;
  const re = /([A-Za-z_$][\w$]*)\s*=\s*class\b/g;
  let match;
  let name = null;
  while ((match = re.exec(src))) {
    if (match.index > ai) break;
    name = match[1];
  }
  return name;
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
  const strip = shortest(fns.filter((x) => x.body.length < 200 && x.body.includes("replace") && x.body.includes("\\[\\/?\\w")));
  const socketOf = shortest(fns.filter((x) => x.body.length < 200 && x.body.includes("sockets") && (x.body.includes(".data?.id===") || x.body.includes(".data.id==="))));
  const count = shortest(fns.filter((x) => x.body.length < 200 && x.body.includes("sockets") && x.body.includes("bInit") && x.body.includes("++")));
  const game = src.match(/new\s+([A-Za-z_$][\w$]*)\s*\(\s*G\.tickRate\s*\)/);
  const char = findCharClass(src);
  const lobbies = src.match(/([A-Za-z_$][\w$]*)\s*\[\s*0\s*\]\s*\?\.bLocked/);
  return {
    game: game ? game[1] : null,
    char: char,
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
  const gamePath = JSON.stringify(String((settings.map && settings.map.gamePath) || settings.gamePath || "").replace(/"/g, "").trim());
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

function cleanWeapons(rows, uniqueCommands) {
  const out = [];
  const seen = new Set();
  if (uniqueCommands == null) uniqueCommands = true;
  (rows || []).forEach((row) => {
    let cmd = String((row && row.command) || "").trim();
    if (!cmd) return;
    if (cmd.charAt(0) !== "/") cmd = "/" + cmd;
    const key = uniqueCommands ? cmd.toLowerCase() : ("i" + out.length);
    const baseId = String((row && row.baseId) || "").trim();
    if (!baseId || seen.has(key)) return;
    seen.add(key);
    const item = { command: cmd, baseId: baseId };
    if (row.adminOnly) item.adminOnly = true;
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

function patchGuess(block, settings) {
  const mini = settings.minigames || {};
  const g = mini.guess || {};
  const max = Number(g.max);
  const moneyMin = Number(g.moneyMin);
  const moneyMax = Number(g.moneyMax);
  const delay = Number(mini.delaySeconds);
  return replaceObject(block, "const MINI = ", {
    delay: Number.isFinite(delay) && delay >= 0 ? Math.floor(delay) : 60,
    guessEnabled: !!g.enabled,
    max: Number.isFinite(max) && max >= 1 ? Math.floor(max) : 100,
    moneyEnabled: !!g.moneyEnabled,
    moneyModesOnly: !!g.moneyModesOnly,
    moneyMin: Number.isFinite(moneyMin) ? Math.floor(moneyMin) : 100,
    moneyMax: Number.isFinite(moneyMax) ? Math.floor(moneyMax) : 1000,
    vehicleEnabled: !!g.vehicleEnabled,
    vehicleId: String(g.vehicleId || "").trim(),
    npcEnabled: !!g.npcEnabled,
    npcId: String(g.npcId || "").trim(),
    weaponEnabled: !!g.weaponEnabled,
    weapons: g.weaponEnabled ? cleanWeapons(g.weapons, false) : [],
  });
}

function patchAfk(block, settings) {
  const a = settings.afk || {};
  const seconds = Number(a.seconds);
  const damage = Number(a.damage);
  const action = a.action === "damage" || a.action === "npc" ? a.action : "kick";
  return replaceObject(block, "const AFK = ", {
    method: a.method === "stats" ? "stats" : "movement",
    seconds: Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 120,
    action: action,
    damage: Number.isFinite(damage) && damage > 0 ? Math.floor(damage) : 25,
    npcId: String(a.npcId || "juggernaut").trim() || "juggernaut",
  });
}

function patchMaxBots(block, settings) {
  const n = Number(settings.bots && settings.bots.MaxSurvivalBots);
  const cap = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
  return block.replace(/const MAX_SURVIVAL_BOTS = \d+;/, "const MAX_SURVIVAL_BOTS = " + cap + ";");
}

function patchMaxMoney(block, settings) {
  const n = Number(settings.bots && settings.bots.maxMoney);
  const cap = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200000;
  return block.replace(/const MAX_MONEY = \d+;/, "const MAX_MONEY = " + cap + ";");
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
  chunks.push(patchMaxMoney(sliceIife(PLUGIN_BUNDLE, "dscMaxMoney"), settings));
  if (on.bots) chunks.push(patchBots(sliceIife(PLUGIN_BUNDLE, "dscBotMods"), settings));
  if (on.commands) chunks.push(patchCommands(sliceIife(PLUGIN_BUNDLE, "dscTextCommands"), settings));
  if (on.weapons) chunks.push(patchWeapons(sliceIife(PLUGIN_BUNDLE, "dscWeaponBuilder"), settings));
  if (on.afk) chunks.push(patchAfk(sliceIife(PLUGIN_BUNDLE, "dscAntiAfk"), settings));
  if (on.minigames) chunks.push(patchGuess(sliceIife(PLUGIN_BUNDLE, "dscMiniGames"), settings));
  return chunks.filter(Boolean).join("\n\n") + "\n";
}

function findGameServer(gamePath) {
  if (!gamePath) return null;
  gamePath = String(gamePath).replace(/"/g, "").trim();
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
  return cleanPath(map.gamePath || settings.gamePath || "");
}

function cleanPath(value) {
  return String(value || "").replace(/"/g, "").trim();
}

function locateSource(settings, fromGame) {
  const dir = cleanPath(settings.serverDir);
  const dest = dir ? path.join(dir, "server.cjs") : "";
  if (!fromGame && dest && fs.existsSync(dest)) return dest;
  const found = findGameServer(installPath(settings));
  if (found) return found;
  if (dest && fs.existsSync(dest)) return dest;
  return null;
}

function buildInto(settings, fromGame) {
  const dir = cleanPath(settings.serverDir);
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

function asText(value) {
    if (value == null || value === "")
        return "";
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    return typeof value === "string" ? value : String(value);
}
function asFlag(value) {
    if (value === true || value === "on" || value === "yes")
        return "on";
    if (value === false || value === "off" || value === "no")
        return "off";
    return "";
}
function weaponFromStored(row) {
    const anims = row.anims && typeof row.anims === "object" ? row.anims : {};
    const offset = anims.offset && typeof anims.offset === "object" ? anims.offset : {};
    const item = {
        command: String(row.command || ""),
        baseId: String(row.baseId || ""),
        adminOnly: row.adminOnly === true || row.adminOnly === "on",
        name: "",
        fireMode: "",
        round: "",
        soundId: "",
        reloadStartSoundId: "",
        type: "",
        categoryType: "",
        leftHand: "",
        rightHand: "",
        damage: "",
        rpm: "",
        fireRate: "",
        accuracy: "",
        recoil: "",
        recoilMultiplier: "",
        range: "",
        radius: "",
        penetration: "",
        gravityScale: "",
        mobility: "",
        aimZoom: "",
        boltDelayTime: "",
        damageType: "",
        burstRate: "",
        numBursts: "",
        magSize: "",
        mag: "",
        ammo: "",
        maxAmmo: "",
        reloadTime: "",
        animX: "",
        animY: "",
        animOffsetX: "",
        animOffsetY: "",
        leftHandAngle: "",
        rightHandAngle: "",
        bSingleRoundLoaded: "",
        bBoltAction: "",
        bPumpAction: "",
        bLeverAction: "",
        bRevolver: "",
        bTopLoaded: "",
        bBullpup: "",
        bSilenced: "",
        bCanLockOn: "",
        bRequireLockOn: "",
        bSmallLaser: "",
        bLayerRightHandBack: "",
        bLayerFront: "",
        bLayerSlideBack: "",
        bLayerLaserBack: "",
        bDisableWalkingAnimation: "",
        bAnimTopLoaded: "",
    };
    const animNum = {
        animX: anims.x,
        animY: anims.y,
        animOffsetX: offset.x,
        animOffsetY: offset.y,
        leftHandAngle: anims.leftHandAngle,
        rightHandAngle: anims.rightHandAngle,
    };
    for (const key of WEAPON_NUMS)
        item[key] = asText(animNum[key] != null ? animNum[key] : row[key]);
    for (const key of WEAPON_STRS) {
        const fromAnim = key === "leftHand" || key === "rightHand" ? anims[key] : undefined;
        item[key] = asText(fromAnim != null && fromAnim !== "" ? fromAnim : row[key]);
    }
    for (const key of WEAPON_BOOLS) {
        const fromAnim = key === "bAnimTopLoaded" ? anims.bTopLoaded : anims[key];
        item[key] = asFlag(fromAnim != null ? fromAnim : row[key]);
    }
    return item;
}
function evalLiteral(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        /* written plugins are JSON; older copies may be plain object literals */
    }
    const code = text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
    if (/function|=>|\brequire\b|\bimport\b|\bprocess\b|\bglobal\b|\beval\b|\bwhile\b|\bfor\b/.test(code))
        return undefined;
    try {
        return Function(`"use strict"; return (${text});`)();
    }
    catch {
        return undefined;
    }
}
function readLiteral(src, decl) {
    const at = src.indexOf(decl);
    if (at < 0)
        return undefined;
    let i = at + decl.length;
    while (i < src.length && /\s/.test(src[i]))
        i++;
    const open = src[i];
    if (open !== "{" && open !== "[")
        return undefined;
    const end = open === "{" ? matchBrace(src, i) : matchBracket(src, i);
    if (end < 0)
        return undefined;
    return evalLiteral(src.slice(i, end + 1));
}
function readSimple(block, name) {
    const match = block.match(new RegExp(`const ${name} = (true|false|-?\\d+|"(?:\\\\.|[^"\\\\])*");`));
    if (!match)
        return undefined;
    const raw = match[1];
    if (raw === "true")
        return true;
    if (raw === "false")
        return false;
    if (raw.startsWith('"')) {
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    return Number(raw);
}
function splitPlus(expr) {
    const parts = [];
    let start = 0;
    let quote = null;
    let esc = false;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (quote) {
            if (esc) {
                esc = false;
                continue;
            }
            if (c === "\\") {
                esc = true;
                continue;
            }
            if (c === quote)
                quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") {
            quote = c;
            continue;
        }
        if (expr.startsWith(" + ", i)) {
            parts.push(expr.slice(start, i).trim());
            i += 2;
            start = i + 1;
        }
    }
    parts.push(expr.slice(start).trim());
    return parts.filter(Boolean);
}
function decodePart(part) {
    if (part === "playerUsername(chat)")
        return "{user}";
    if (part === "sanitize(chat.message)")
        return "{message}";
    if (part.startsWith('"') && part.endsWith('"')) {
        try {
            return JSON.parse(part);
        }
        catch {
            return "";
        }
    }
    return "";
}
function readDiscordTemplate(block) {
    const tick = block.match(/content:\s*\(`([\s\S]*?)`\)\.slice\(0,\s*2000\)/);
    if (tick) {
        return tick[1].replace(/\$\{playerUsername\(chat\)\}/g, "{user}").replace(/\$\{sanitize\(chat\.message\)\}/g, "{message}");
    }
    const marker = "content: ((";
    const at = block.indexOf(marker);
    if (at < 0)
        return null;
    const from = at + marker.length;
    const needle = ").slice(0, 2000)";
    let quote = null;
    let esc = false;
    let sliceAt = -1;
    for (let i = from; i < block.length; i++) {
        const c = block[i];
        if (quote) {
            if (esc) {
                esc = false;
                continue;
            }
            if (c === "\\") {
                esc = true;
                continue;
            }
            if (c === quote)
                quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") {
            quote = c;
            continue;
        }
        if (block.startsWith(needle, i)) {
            sliceAt = i;
            break;
        }
    }
    if (sliceAt < 0)
        return null;
    const expr = block.slice(from, sliceAt).trim();
    if (!expr)
        return "";
    return splitPlus(expr).map(decodePart).join("");
}
function asStringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}
function importSettings(src, base) {
    if (!src || !src.includes("function") || src.length < 200) {
        return { settings: base, found: [], message: "", error: "That file does not look like server.cjs." };
    }
    const next = JSON.parse(JSON.stringify(base));
    next.serverDir = base.serverDir;
    const plugins = { ...next.plugins };
    ["discord", "ranks", "tips", "webchat", "match", "rankboard", "map", "bots", "commands", "weapons", "afk", "minigames"].forEach((key) => {
        plugins[key] = false;
    });
    const found = [];
    let extensions = false;
    function take(name, key, label, apply) {
        const block = sliceIife(src, name);
        if (!block)
            return;
        plugins[key] = true;
        found.push(label);
        try {
            apply(block);
        }
        catch {
            /* keep the settings already on this plugin */
        }
    }
    take("dscChatToDiscord", "discord", "Game Chat To Discord", (block) => {
        const hook = block.match(/DISCORD_WEBHOOK_URL\s*=[\s\S]*?\|\|\s*("(?:\\.|[^"\\])*")\s*;/);
        if (hook) {
            try {
                next.discord.webhook = JSON.parse(hook[1]);
            }
            catch {
                /* leave the current webhook */
            }
        }
        const ignoreCommands = readSimple(block, "IGNORE_COMMANDS");
        const ignoreServer = readSimple(block, "IGNORE_SERVER_MESSAGES");
        const gap = readSimple(block, "MIN_INTERVAL_MS");
        if (typeof ignoreCommands === "boolean")
            next.discord.ignoreCommands = ignoreCommands;
        if (typeof ignoreServer === "boolean")
            next.discord.ignoreServerMessages = ignoreServer;
        if (typeof gap === "number")
            next.discord.minIntervalMs = gap;
        const template = readDiscordTemplate(block);
        if (template != null)
            next.discord.messageTemplate = template;
    });
    take("dscCustomLevels", "ranks", "Ranks", (block) => {
        const cfg = readLiteral(block, "const DEFAULT_CFG = ");
        if (!cfg || typeof cfg !== "object")
            return;
        const row = cfg;
        if (typeof row.statsFile === "string" && row.statsFile.trim())
            next.ranks.statsFile = row.statsFile.trim();
        for (const key of ["xpKill", "xpAssist", "xpWin", "xpDeath", "xpLoss", "xpTeamHit", "teamHitCooldownMs"]) {
            if (typeof row[key] === "number")
                next.ranks[key] = row[key];
        }
        if (typeof row.levelUpMessage === "string")
            next.ranks.levelUpMessage = row.levelUpMessage;
        if (typeof row.demoteMessage === "string")
            next.ranks.demoteMessage = row.demoteMessage;
        if (row.displayMode === "clan" || row.displayMode === "name" || row.displayMode === "both")
            next.ranks.displayMode = row.displayMode;
        if (typeof row.prefixFormat === "string")
            next.ranks.prefixFormat = row.prefixFormat;
        if (Array.isArray(row.ranks)) {
            next.ranks.ranks = row.ranks
                .filter((rank) => rank && typeof rank === "object" && String(rank.name || "").trim())
                .map((rank) => ({ minXp: Number(rank.minXp) || 0, name: String(rank.name).trim() }));
        }
    });
    take("dscTooltips", "tips", "Timed Tooltips", (block) => {
        const tips = readLiteral(block, "const TIPS = ");
        if (!Array.isArray(tips))
            return;
        next.tips.tips = tips
            .filter((tip) => tip && typeof tip === "object")
            .map((tip) => ({
            message: String(tip.message || ""),
            delaySeconds: Math.max(1, Number(tip.delaySeconds) || 60),
        }))
            .filter((tip) => tip.message.trim());
    });
    take("dscWebChat", "webchat", "Website Chat", (block) => {
        const ms = readSimple(block, "CHAT_COOLDOWN_MS");
        if (typeof ms === "number")
            next.webchat.chatCooldownMs = ms;
    });
    take("dscMatchBoard", "match", "Match Board", (block) => {
        const players = readSimple(block, "HIDE_PLAYERS");
        const bots = readSimple(block, "HIDE_BOTS");
        if (typeof players === "boolean")
            next.match.hidePlayers = players;
        if (typeof bots === "boolean")
            next.match.hideBots = bots;
    });
    take("dscRanksBoard", "rankboard", "Ranks Board", (block) => {
        const file = readSimple(block, "STATS_FILE");
        const mode = readSimple(block, "BOARD_MODE");
        if (typeof file === "string" && file.trim())
            next.ranks.statsFile = file.trim();
        if (mode === "custom" || mode === "official" || mode === "both")
            next.rankboard.statsView = mode;
    });
    take("dscLiveMinimap", "map", "Live Map", (block) => {
        const gamePath = readSimple(block, "GAME_PATH");
        if (typeof gamePath === "string")
            next.map.gamePath = gamePath.replace(/"/g, "");
    });
    take("dscBotMods", "bots", "RAGE Bots", (block) => {
        const cfg = readLiteral(block, "const DEFAULTS = ");
        if (!cfg || typeof cfg !== "object")
            return;
        const row = cfg;
        if (typeof row.clanFormat === "string")
            next.bots.clanFormat = row.clanFormat;
        if (typeof row.MaxSurvivalBots === "number")
            next.bots.MaxSurvivalBots = row.MaxSurvivalBots;
        if (typeof row.rageEnabled === "boolean")
            next.bots.rageEnabled = row.rageEnabled;
        if (typeof row.ragePerksEnabled === "boolean")
            next.bots.ragePerksEnabled = row.ragePerksEnabled;
        if (typeof row.survivalAllyRage === "boolean")
            next.bots.survivalAllyRage = row.survivalAllyRage;
        if (typeof row.rageAutoSpawn === "number")
            next.bots.rageAutoSpawn = row.rageAutoSpawn;
        if (typeof row.rageLevel === "number")
            next.bots.rageLevel = row.rageLevel;
        if (typeof row.ragePrestige === "number")
            next.bots.ragePrestige = row.ragePrestige;
        if (Array.isArray(row.rageNames))
            next.bots.rageNames = asStringList(row.rageNames);
        if (Array.isArray(row.ragePerks))
            next.bots.ragePerks = asStringList(row.ragePerks);
    });
    take("dscTextCommands", "commands", "Custom Text Commands", (block) => {
        const rows = readLiteral(block, "const COMMANDS = ");
        if (!Array.isArray(rows))
            return;
        next.commands.commands = rows
            .filter((row) => row && typeof row === "object")
            .map((row) => ({ command: String(row.command || ""), text: String(row.text || "") }));
    });
    take("dscWeaponBuilder", "weapons", "Weapon Builder", (block) => {
        const rows = readLiteral(block, "const WEAPONS = ");
        if (!Array.isArray(rows))
            return;
        next.weapons.weapons = rows.filter((row) => row && typeof row === "object").map((row) => weaponFromStored(row));
    });
    take("dscAntiAfk", "afk", "Anti AFK", (block) => {
        const cfg = readLiteral(block, "const AFK = ");
        if (!cfg || typeof cfg !== "object")
            return;
        const row = cfg;
        next.afk.method = row.method === "stats" ? "stats" : "movement";
        if (typeof row.seconds === "number")
            next.afk.seconds = row.seconds;
        next.afk.action = row.action === "damage" || row.action === "npc" ? row.action : "kick";
        if (typeof row.damage === "number")
            next.afk.damage = row.damage;
        if (typeof row.npcId === "string" && row.npcId.trim())
            next.afk.npcId = row.npcId.trim();
    });
    take("dscMiniGames", "minigames", "MiniGame's", (block) => {
        const cfg = readLiteral(block, "const MINI = ");
        if (!cfg || typeof cfg !== "object")
            return;
        const row = cfg;
        if (typeof row.delay === "number")
            next.minigames.delaySeconds = row.delay;
        const guess = next.minigames.guess;
        if (typeof row.guessEnabled === "boolean")
            guess.enabled = row.guessEnabled;
        if (typeof row.max === "number")
            guess.max = row.max;
        if (typeof row.moneyEnabled === "boolean")
            guess.moneyEnabled = row.moneyEnabled;
        if (typeof row.moneyModesOnly === "boolean")
            guess.moneyModesOnly = row.moneyModesOnly;
        if (typeof row.moneyMin === "number")
            guess.moneyMin = row.moneyMin;
        if (typeof row.moneyMax === "number")
            guess.moneyMax = row.moneyMax;
        if (typeof row.vehicleEnabled === "boolean")
            guess.vehicleEnabled = row.vehicleEnabled;
        if (typeof row.vehicleId === "string")
            guess.vehicleId = row.vehicleId;
        if (typeof row.npcEnabled === "boolean")
            guess.npcEnabled = row.npcEnabled;
        if (typeof row.npcId === "string")
            guess.npcId = row.npcId;
        if (typeof row.weaponEnabled === "boolean")
            guess.weaponEnabled = row.weaponEnabled;
        if (Array.isArray(row.weapons))
            guess.weapons = row.weapons.filter((gun) => gun && typeof gun === "object").map((gun) => weaponFromStored(gun));
    });
    const maxBots = sliceIife(src, "dscMaxBots");
    if (maxBots) {
        const cap = readSimple(maxBots, "MAX_SURVIVAL_BOTS");
        if (typeof cap === "number") {
            next.bots.MaxSurvivalBots = cap;
            extensions = true;
        }
    }
    const maxMoney = sliceIife(src, "dscMaxMoney");
    if (maxMoney) {
        const cap = readSimple(maxMoney, "MAX_MONEY");
        if (typeof cap === "number") {
            next.bots.maxMoney = cap;
            extensions = true;
        }
    }
    next.plugins = plugins;
    if (!found.length && !extensions) {
        return { settings: base, found: [], message: "", error: "That server.cjs has no builder plugins to import." };
    }
    const extra = extensions ? " Max Survival Bots and Max Money were copied too." : "";
    const message = found.length
        ? `Imported ${found.join(", ")}. Those plugins are on.${extra} Write them onto the new server.cjs when you are ready.`
        : `No optional plugins were in that file.${extra}`;
    return { settings: next, found, message };
}

module.exports = { scanServer, locateSource, buildInto, findGameServer, importSettings };

