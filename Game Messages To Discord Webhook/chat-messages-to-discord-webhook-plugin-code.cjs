/* ============================================================
   DSC in-game chat  →  Discord webhook
   Coded by @MuliBovich
   Join my DeadSwitch Combat Discord server made for server hoster's! https://discord.gg/enQTBuHVsC
   ============================================================ */
(function dscChatToDiscord() {
    const DISCORD_WEBHOOK_URL =
        (typeof F !== "undefined" && (F.discordWebhook || F.discordWebhookUrl)) || "";

    const IGNORE_COMMANDS = false;
    const IGNORE_SERVER_MESSAGES = true;
    const MIN_INTERVAL_MS = 400;

    if (!DISCORD_WEBHOOK_URL) {
        console.warn("[Discord] F.discordWebhook is missing from server config — chat will not be forwarded.");
        return;
    }

    const stripBb =
        typeof Wn === "function"
            ? Wn
            : (t) => String(t || "").replace(/\[\/?\w+(?:=[^\]]+)?\]/g, "");

    function sanitize(text) {
        return stripBb(text)
            .replace(/@everyone/gi, "@\u200beveryone")
            .replace(/@here/gi, "@\u200bhere")
            .replace(/<@&?\d+>/g, "`mention`")
            .replace(/https?:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\S+/gi, "[webhook]")
            .trim()
            .slice(0, 1800);
    }

    function playerUsername(chat) {
        return sanitize(chat.username || chat.name) || "Unknown";
    }

    function shouldForward(chat) {
        if (!chat || typeof chat !== "object") return false;
        if (chat.bDirectMessage) return false;
        if (IGNORE_SERVER_MESSAGES && (chat.bServerMessage || !chat.playerId)) return false;
        const text = sanitize(chat.message);
        if (!text) return false;
        if (IGNORE_COMMANDS && text.startsWith("/")) return false;
        return true;
    }

    const queue = [];
    let busy = false;

    function enqueue(chat) {
        if (!shouldForward(chat)) return;
        if (queue.length > 50) queue.shift();
        queue.push(chat);
        pump();
    }

    async function pump() {
        if (busy) return;
        busy = true;
        while (queue.length) {
            const chat = queue.shift();
            try {
                await post(chat);
            } catch (err) {
                console.warn("[Discord] Webhook failed:", err && err.message ? err.message : err);
            }
            await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
        }
        busy = false;
    }

    function post(chat) {
        const who = playerUsername(chat);
        const text = sanitize(chat.message);
        const body = {
            allowed_mentions: { parse: [] },
            content: `Player: ${who} :said: ${text} :in the game chat.`.slice(0, 2000),
        };

        if (typeof Ni !== "undefined" && Ni && typeof Ni.post === "function") {
            return Ni.post(DISCORD_WEBHOOK_URL, body).catch((e) => {
                throw new Error((e.response && e.response.status) || e.message);
            });
        }
        return fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }).then((res) => {
            if (!res.ok && res.status !== 204) throw new Error("HTTP " + res.status);
        });
    }

    if (typeof wt === "function") {
        const _wt = wt;
        wt = function (lobbyId, chat) {
            _wt(lobbyId, chat);
            enqueue(chat);
        };
    }
    if (typeof $S === "function") {
        const _global = $S;
        $S = function (chat, toAll) {
            _global(chat, toAll);
            enqueue(chat);
        };
    }

    console.log("[Discord] In-game chat → webhook enabled");
})();