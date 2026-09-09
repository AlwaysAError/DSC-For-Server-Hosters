# Ingame Messages To Discord Webhooks

Makes moderation easier, coded in configurable settings, allows Discord server members to know what's going off in your server!  
Also includes console error messages and editable settings within the code:  
``const IGNORE_COMMANDS = false;``  
``const IGNORE_SERVER_MESSAGES = true;``  
``const MIN_INTERVAL_MS = 400;``  
**Discord Webhook**  
The code will respect Discord's rate limit and will delay messages if needed to ensure your Discord webhook never fails or gets rate limited.  
How to set up:  
1. Open your server config and add the new line  
```"discordWebhook": "YourDiscordWebhookHere",```  
2. Download the provided .cjs file (the code for the plugin)  
3. Open the server file "server.cjs"  
4. Copy the code from the provided file  
5. Paste the code at the bottom of the "server.cjs" file ON A NEW LINE  
That's how easy it is

