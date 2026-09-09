/* ============================================================
   DSC custom ranks
   Config:  dsc_levels_config.json
   Coded by @MuliBovich
   Join my DeadSwitch Combat Discord server made for server hoster's! https://discord.gg/enQTBuHVsC
   ============================================================ */
(function dscCustomLevels() {
    const fs = require("fs");
    const path = require("path");

    if (global.__dscLevelsLoaded) {
        console.warn("[Levels] Already loaded — remove the duplicate block.");
        return;
    }
    global.__dscLevelsLoaded = true;

    if (typeof F !== "undefined" && F.customLevels === false) return;
    if (typeof ks !== "function") {
        console.warn("[Levels] Game class not found — script not loaded.");
        return;
    }

    const CONFIG_FILE = path.join(__dirname, "dsc_levels_config.json");

    const DEFAULT_CFG = {
        statsFile: "dsc_levels.json",
        xpKill: 5,
        xpAssist: 1,
        xpWin: 20,
        xpDeath: -5,
        xpLoss: -10,
        xpTeamHit: -10,
        teamHitCooldownMs: 100,
        tipEnabled: true,
        tipIntervalSeconds: 60,
        tipMessage: "[b]Custom commands:[/b] type [b]/score[/b] or [b]/rank[/b] to see your rank and EXP, or [b]/top[/b] for the leaderboard.",
        levelUpMessage: "[b]{player}[/b] ranked up to [b]{rank}[/b]!",
        demoteMessage: "[b]{player}[/b] was demoted to [b]{rank}[/b].",
        displayMode: "clan",
        prefixFormat: "({rank}) {name}",
        ranks: [
            { minXp: 0, name: "BEGINNER" },
            { minXp: 50, name: "NOOB" },
            { minXp: 150, name: "ROOKIE" },
            { minXp: 300, name: "AMATEUR" },
            { minXp: 800, name: "KILLER" },
            { minXp: 1000, name: "GUNNER" },
            { minXp: 1500, name: "SPECIALIST" },
            { minXp: 2000, name: "SERGEANT" },
            { minXp: 4000, name: "MAJOR" },
            { minXp: 5000, name: "VETERAN" },
            { minXp: 6000, name: "PRO" },
            { minXp: 7000, name: "DEMON" },
            { minXp: 8000, name: "ASSASSIN" },
            { minXp: 9500, name: "SLAYER" },
            { minXp: 11000, name: "SIGMA" },
            { minXp: 12000, name: "MOGGER" },
            { minXp: 15000, name: "EXTREME" },
            { minXp: 20000, name: "ELITE" },
            { minXp: 22000, name: "ALPHA" },
            { minXp: 23500, name: "HUNTER" },
            { minXp: 25000, name: "SHADOW" },
            { minXp: 50000, name: "WIZARD" },
            { minXp: 80000, name: "LEGEND" },
            { minXp: 100000, name: "MYTHIC" },
            { minXp: 150000, name: "IMMORTAL" },
            { minXp: 300000, name: "GOD" },
            { minXp: 500000, name: "OVERLORD" },
            { minXp: 1000000, name: "APEX" },
            { minXp: 3000000, name: "ETERNAL" },
            { minXp: 5000000, name: "UNSTOPPABLE" },
            { minXp: 10000000, name: "IMPOSSIBLE" }
        ]
    };

    let CFG = Object.assign({}, DEFAULT_CFG, { ranks: DEFAULT_CFG.ranks.slice() });
    const teamHitCooldown = new Map();
    let db = {};
    let prefixRe = /^\[\d+\]\s+/i;
    let statsAbsPath = null;

    function rebuildPrefixRe() {
        const names = (CFG.ranks || []).map((r) => String(r.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const or = names.concat("\\d+").join("|");
        prefixRe = new RegExp(
            "^(?:\\[(?:#|\\s)?(?:" + or + ")!?\\s?\\]|\\((?:" + or + ")\\)|(?:" + or + ")\\s\\|\\s)\\s*",
            "i"
        );
    }
    function isRankName(s) {
        if (!s) return false;
        const u = String(s).toUpperCase();
        return (CFG.ranks || []).some((r) => String(r.name).toUpperCase() === u);
    }
    function resolveStatsPath(filePath) {
        if (!filePath || typeof filePath !== "string" || !filePath.trim()) return null;
        return path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
    }

    function loadConfig() {
        try {
            if (!fs.existsSync(CONFIG_FILE)) {
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CFG, null, 2));
                console.log("[Levels] Created", CONFIG_FILE);
            }
            const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8") || "{}") || {};
            CFG = Object.assign({}, DEFAULT_CFG, raw);
            if (!Array.isArray(raw.ranks) || !raw.ranks.length) CFG.ranks = DEFAULT_CFG.ranks.slice();
            CFG.ranks = CFG.ranks.slice().sort((a, b) => a.minXp - b.minXp);
            rebuildPrefixRe();
            if (!raw.statsFile || !String(raw.statsFile).trim()) {
                CFG.statsFile = DEFAULT_CFG.statsFile;
                raw.statsFile = CFG.statsFile;
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(Object.assign({}, CFG, raw), null, 2));
                console.warn("[Levels] statsFile was missing — wrote default:", CFG.statsFile);
            }
            statsAbsPath = resolveStatsPath(CFG.statsFile);
        } catch (e) {
            console.warn("[Levels] Config error, using defaults:", e.message);
            CFG = Object.assign({}, DEFAULT_CFG, { ranks: DEFAULT_CFG.ranks.slice() });
            rebuildPrefixRe();
            statsAbsPath = resolveStatsPath(CFG.statsFile);
        }
    }
    loadConfig();

    if (!statsAbsPath) {
        console.warn("[Levels] statsFile must be defined in dsc_levels_config.json — ranks disabled.");
        return;
    }

    function sleepMs(ms) {
        const t = Date.now() + ms;
        while (Date.now() < t) { }
    }
    function destPath() {
        return resolveStatsPath(CFG.statsFile) || statsAbsPath;
    }
    function acquireLock(lockPath) {
        const start = Date.now();
        while (Date.now() - start < 4000) {
            try {
                return fs.openSync(lockPath, "wx");
            } catch (e) {
                if (e.code !== "EEXIST") throw e;
                try {
                    if (Date.now() - fs.statSync(lockPath).mtimeMs > 8000) fs.unlinkSync(lockPath);
                } catch (_) { }
                sleepMs(25);
            }
        }
        throw new Error("stats lock timeout");
    }
    function reloadDbUnlocked(dest) {
        try {
            if (dest && fs.existsSync(dest)) {
                db = JSON.parse(fs.readFileSync(dest, "utf8") || "{}") || {};
            } else {
                db = db || {};
            }
        } catch (e) {
            console.warn("[Levels] Reload failed:", e.message);
        }
    }
    function writeDbUnlocked(dest) {
        if (!dest) return;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = dest + ".tmp." + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
        try {
            fs.renameSync(tmp, dest);
        } catch (_) {
            fs.copyFileSync(tmp, dest);
            try { fs.unlinkSync(tmp); } catch (_) { }
        }
    }
    function withDb(fn) {
        const dest = destPath();
        if (!dest) return fn();
        const lockPath = dest + ".lock";
        let fd;
        try {
            fd = acquireLock(lockPath);
        } catch (e) {
            console.warn("[Levels] Lock failed:", e.message);
            reloadDbUnlocked(dest);
            return fn();
        }
        try {
            reloadDbUnlocked(dest);
            const out = fn();
            writeDbUnlocked(dest);
            return out;
        } finally {
            try { if (fd != null) fs.closeSync(fd); } catch (_) { }
            try { fs.unlinkSync(lockPath); } catch (_) { }
        }
    }

    withDb(() => { });

    function format(tpl, vars) {
        return String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
    }
    function rankFromXp(xp) {
        const n = Math.max(0, xp || 0);
        let rank = CFG.ranks[0] || { minXp: 0, name: "BEGINNER" };
        for (let i = 0; i < CFG.ranks.length; i++) {
            if (n >= CFG.ranks[i].minXp) rank = CFG.ranks[i];
        }
        return rank;
    }
    function nextRank(xp) {
        const n = Math.max(0, xp || 0);
        for (let i = 0; i < CFG.ranks.length; i++) {
            if (n < CFG.ranks[i].minXp) return CFG.ranks[i];
        }
        return null;
    }
    function rankIndex(name) {
        return CFG.ranks.findIndex((r) => r.name === name);
    }
    function playerKey(p) {
        if (!p || p.bBot) return null;
        return p.steamID || p.username || null;
    }
    function stripPrefix(name) {
        return String(name || "Player").replace(prefixRe, "");
    }
    function getRecord(p) {
        if (!p || p.bBot) return null;
        const sid = p.steamID;
        const un = p.username;
        const key = sid || un;
        if (!key) return null;

        if (sid && un && db[un] && !db[sid]) {
            db[sid] = db[un];
            delete db[un];
        }

        const k = (sid && db[sid]) ? sid : ((un && db[un]) ? un : key);
        if (!db[k]) {
            db[k] = {
                xp: 0, kills: 0, assists: 0, deaths: 0, wins: 0, losses: 0,
                teamHits: 0, games: 0, rank: CFG.ranks[0].name, name: "", username: ""
            };
        }
        const rec = db[k];
        if (p.name) rec.name = stripPrefix(p.name);
        if (un) rec.username = un;
        rec.xp = Math.max(0, rec.xp || 0);
        rec.rank = rankFromXp(rec.xp).name;
        return rec;
    }

    function serverChat(message, lobbyId) {
        if (!message) return;
        const payload = { message, bServerMessage: true, bbCode: true, name: "Server", date: Date.now() };
        if (lobbyId && typeof wt === "function") {
            wt(lobbyId, payload);
            return;
        }
        if (typeof $S === "function") {
            $S(payload, true);
            return;
        }
        if (typeof Pe !== "undefined") Pe.of("/").emit("chat", payload);
    }

    function applyRankToPlayer(p) {
        if (!p || p.bBot || !playerKey(p)) return null;
        const rec = getRecord(p);
        if (!rec) return null;
        if (!p._baseName) p._baseName = stripPrefix(p.name);
        if (p._baseClan == null && p.clan && !isRankName(p.clan)) p._baseClan = p.clan;

        const mode = CFG.displayMode || "clan";
        if (mode === "name" || mode === "both") {
            p.name = format(CFG.prefixFormat || "({rank}) {name}", { rank: rec.rank, name: p._baseName, xp: rec.xp });
        } else {
            p.name = p._baseName;
        }
        if (mode === "clan" || mode === "both") {
            p.clan = rec.rank;
        }
        return rec;
    }

    function pushToClients(socket) {
        if (!socket || !socket.data) return;
        const d = socket.data;
        const lobby = typeof nt === "function" ? nt(d.lobbyId) : null;
        if (lobby && typeof Pe !== "undefined") {
            Pe.to(lobby.id).emit("playerUpdated", { id: d.id, name: d.name, clan: d.clan });
            Pe.to(lobby.id).emit("lobbyUpdated", { players: lobby.players });
        }
        const game = lobby && lobby.game;
        if (game) {
            if (typeof game.getPlayerById === "function") {
                const gp = game.getPlayerById(d.id);
                if (gp) {
                    gp.name = d.name;
                    gp.clan = d.clan;
                }
            }
            if (typeof game.onEvent === "function") {
                game.onEvent({ eventId: 18, id: d.id, data: { name: d.name, clan: d.clan } }, true);
            }
        }
    }

    function applyPrefix(socket) {
        if (!socket || !socket.data || socket.data.bBot) return;
        if (!playerKey(socket.data)) return;
        withDb(() => { applyRankToPlayer(socket.data); });
        pushToClients(socket);
    }

    function addStatsUnlocked(p, add, game) {
        const rec = getRecord(p);
        if (!rec) return;
        const prevRank = rec.rank;

        if (add.kills) rec.kills += add.kills;
        if (add.assists) rec.assists += add.assists;
        if (add.deaths) rec.deaths += add.deaths;
        if (add.wins) rec.wins += add.wins;
        if (add.losses) rec.losses += add.losses;
        if (add.teamHits) rec.teamHits += add.teamHits;
        if (add.games) rec.games += add.games;

        let delta = add.xp != null ? add.xp : 0;
        if (add.kills) delta += add.kills * CFG.xpKill;
        if (add.assists) delta += add.assists * CFG.xpAssist;
        if (add.wins) delta += add.wins * CFG.xpWin;
        if (add.deaths) delta += add.deaths * CFG.xpDeath;
        if (add.losses) delta += add.losses * CFG.xpLoss;
        if (add.teamHits) delta += add.teamHits * CFG.xpTeamHit;

        rec.xp = Math.max(0, rec.xp + delta);
        rec.rank = rankFromXp(rec.xp).name;

        if (rec.rank !== prevRank) {
            const who = stripPrefix(p.name);
            const up = rankIndex(rec.rank) > rankIndex(prevRank);
            const lobbyId = game && game.config && game.config.lobbyId;
            serverChat(format(up ? CFG.levelUpMessage : CFG.demoteMessage, {
                player: who,
                rank: rec.rank,
                oldRank: prevRank,
                xp: rec.xp
            }), lobbyId);
        }
    }

    function addStats(p, add, game) {
        const socket = typeof mr === "function" ? mr(p.id) : null;
        withDb(() => {
            addStatsUnlocked(p, add, game);
            if (socket) applyRankToPlayer(socket.data);
            else applyRankToPlayer(p);
        });
        if (socket) pushToClients(socket);
    }

    function scoreMessage(rec) {
        const rank = rankFromXp(rec.xp);
        const nxt = nextRank(rec.xp);
        const nextLine = nxt
            ? `Next rank: [b]${nxt.name}[/b] at ${nxt.minXp} EXP (${nxt.minXp - rec.xp} to go)`
            : `[b]Max rank[/b]`;
        return (
            `[b]${rank.name}[/b]  —  ${rec.xp} EXP\n` +
            `${nextLine}\n\n` +
            `[family=monospace]` +
            `Kills      ${rec.kills || 0}   (${CFG.xpKill >= 0 ? "+" : ""}${CFG.xpKill} EXP each)\n` +
            `Assists    ${rec.assists || 0}   (${CFG.xpAssist >= 0 ? "+" : ""}${CFG.xpAssist} EXP each)\n` +
            `Deaths     ${rec.deaths || 0}   (${CFG.xpDeath >= 0 ? "+" : ""}${CFG.xpDeath} EXP each)\n` +
            `Wins       ${rec.wins || 0}   (${CFG.xpWin >= 0 ? "+" : ""}${CFG.xpWin} EXP each)\n` +
            `Losses     ${rec.losses || 0}   (${CFG.xpLoss >= 0 ? "+" : ""}${CFG.xpLoss} EXP each)\n` +
            `Team hits  ${rec.teamHits || 0}   (${CFG.xpTeamHit >= 0 ? "+" : ""}${CFG.xpTeamHit} EXP each)` +
            `[/family]`
        );
    }

    function onGameEnded(game, data) {
        if (!game || typeof game.getPlayers !== "function") return;
        const players = game.getPlayers().filter((p) => p && !p.bBot && p.team !== -1);

        withDb(() => {
            for (const p of players) addStatsUnlocked(p, { games: 1 }, game);
            if (!data || data.result === 2) return;

            const winnerIds = new Set();
            if (Array.isArray(data.winners) && data.winners.length) {
                data.winners.forEach((id) => winnerIds.add(id));
            } else if (data.winningTeam != null && data.winningTeam >= 0) {
                players.forEach((p) => { if (p.team === data.winningTeam) winnerIds.add(p.id); });
            }
            if (winnerIds.size) {
                for (const p of players) {
                    if (winnerIds.has(p.id)) addStatsUnlocked(p, { wins: 1 }, game);
                    else addStatsUnlocked(p, { losses: 1 }, game);
                }
            }
        });

        for (const p of players) {
            const socket = typeof mr === "function" ? mr(p.id) : null;
            if (socket) {
                applyRankToPlayer(socket.data);
                pushToClients(socket);
            }
        }
    }

    const _addPlayer = ks.prototype.addPlayer;
    ks.prototype.addPlayer = function (player) {
        try { withDb(() => applyRankToPlayer(player)); } catch (_) { }
        return _addPlayer.apply(this, arguments);
    };

    const _kill = ks.prototype.onPlayerKill;
    ks.prototype.onPlayerKill = function (killer, dmg, victim) {
        let teamKill = false;
        try {
            const vTeam = victim && typeof victim.getTeam === "function"
                ? victim.getTeam()
                : victim && victim.data && victim.data.team;
            teamKill = killer && vTeam != null && killer.team != null && vTeam === killer.team;
        } catch (_) { }
        const ret = _kill.apply(this, arguments);
        try {
            if (killer && !killer.bBot && !teamKill) addStats(killer, { kills: 1 }, this);
        } catch (e) { console.warn("[Levels]", e.message); }
        return ret;
    };

    const _onEvent = ks.prototype.onEvent;
    ks.prototype.onEvent = function (evt) {
        const ret = _onEvent.apply(this, arguments);
        try {
            if (evt && evt.eventId === 18 && evt.data) {
                const p = this.getPlayerById(evt.id);
                if (p && !p.bBot) {
                    if (typeof evt.data.assists === "number") addStats(p, { assists: 1 }, this);
                    if (typeof evt.data.deaths === "number") addStats(p, { deaths: 1 }, this);
                }
            }
        } catch (e) { console.warn("[Levels]", e.message); }
        return ret;
    };

    const _dmg = ks.prototype.applyDamage;
    ks.prototype.applyDamage = function (victim, info, causer, instigator) {
        const ret = _dmg.apply(this, arguments);
        try {
            if (!victim || !info || !(info.damage > 0)) return ret;
            if (info.weaponId === "fall") return ret;
            const attacker = instigator || (causer && this.getPlayerById(causer.id));
            if (!attacker || attacker.bBot) return ret;
            const vPlayer = this.getPlayerById(victim.id);
            if (vPlayer && vPlayer.id === attacker.id) return ret;
            const vTeam = typeof victim.getTeam === "function" ? victim.getTeam() : victim.data && victim.data.team;
            if (vTeam == null || attacker.team == null || vTeam !== attacker.team) return ret;

            const key = attacker.id + ">" + victim.id;
            const now = Date.now();
            if (now - (teamHitCooldown.get(key) || 0) < CFG.teamHitCooldownMs) return ret;
            teamHitCooldown.set(key, now);
            addStats(attacker, { teamHits: 1 }, this);
        } catch (e) { console.warn("[Levels]", e.message); }
        return ret;
    };

    const _cb = ks.prototype.triggerCallback;
    ks.prototype.triggerCallback = function (name, data) {
        if (name === "gameEnded") {
            try { onGameEnded(this, data); } catch (e) { console.warn("[Levels]", e.message); }
        }
        return _cb.apply(this, arguments);
    };

    if (typeof cX === "function") {
        const _cX = cX;
        cX = async function (socket, payload) {
            try {
                if (payload && payload.name) socket.data._baseName = stripPrefix(payload.name);
                if (payload && payload.clan && !isRankName(payload.clan)) socket.data._baseClan = payload.clan;
            } catch (_) { }
            const ret = await _cX(socket, payload);
            try { applyPrefix(socket); } catch (e) { console.warn("[Levels]", e.message); }
            return ret;
        };
    }
    if (typeof Yn === "function") {
        const _Yn = Yn;
        Yn = function (socket, lobby) {
            try { applyPrefix(socket); } catch (_) { }
            return _Yn(socket, lobby);
        };
    }

    if (typeof Q$ === "function") {
        const _Q$ = Q$;
        Q$ = function (socket, args) {
            const cmd = args && args[0] && String(args[0]).toLowerCase();
            if (cmd === "/score" || cmd === "/rank" || cmd === "/level") {
                let rec;
                withDb(() => {
                    rec = getRecord(socket.data) || { xp: 0, kills: 0, assists: 0, deaths: 0, wins: 0, losses: 0, teamHits: 0 };
                });
                ct(socket, {
                    bDirectMessage: true,
                    bServerMessage: true,
                    bbCode: true,
                    message: scoreMessage(rec)
                });
                return;
            }
            if (cmd === "/top") {
                let rows;
                withDb(() => {
                    rows = Object.values(db).sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 10);
                });
                let msg = "[b]Top ranks[/b][family=monospace]";
                (rows || []).forEach((r, i) => {
                    const n = r.username || r.name || "Player";
                    msg += `\n[${i + 1}] ${rankFromXp(r.xp).name}  ${n}  (${r.xp || 0} EXP)`;
                });
                msg += "[/family]";
                ct(socket, { bDirectMessage: true, bServerMessage: true, bbCode: true, message: msg });
                return;
            }
            return _Q$(socket, args);
        };
    }

    setInterval(() => {
        try {
            loadConfig();
            if (!CFG.tipEnabled || !CFG.tipMessage) return;
            const n = typeof ii === "function" ? ii() : 0;
            if (n < 1) return;
            serverChat(CFG.tipMessage);
        } catch (e) {
            console.warn("[Levels] Tip failed:", e.message);
        }
    }, Math.max(10, CFG.tipIntervalSeconds || 60) * 1000);

    process.on("exit", () => { try { withDb(() => { }); } catch (_) { } });

    console.log("[Levels] Custom ranks enabled (shared-file lock)");
    console.log("[Levels] Config:", CONFIG_FILE);
    console.log("[Levels] Stats file:", statsAbsPath);
})();