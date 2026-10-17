# PEAK CLANS BOT — HTTP Interactions + Express + SQLite

English slash-command clan system for Discord. **No Gateway connection**: Discord sends interactions to the public HTTPS endpoint.

## Included
- `/clan create`, `info`, `invite`, `join`, `leave`, `kick`, `promote`, `members`
- `/war challenge`, `accept`, `decline`, `report`, `confirm`, `list`, `cancel`
- `/leaderboard [limit]`
- `/points [tag]`
- `/clanadmin addpoints`, `delete` (Administrator permission)
- SQLite persistence in `data/peak-clans.sqlite`
- Audit log table; `/health` endpoint
- Discord request signature verification (Ed25519)
- PING response for Discord endpoint verification

## Important limits
- HTTP Interactions are not a Gateway client. This bot does not receive ordinary messages, member-join events, or presence updates.
- It does not send unsolicited notifications or webhook log messages by itself; it stores audit logs in SQLite. A separate webhook log sender can be added if wanted.
- On Replit, use a deployment that provides a public HTTPS URL and persistent disk/volume for SQLite. Temporary/ephemeral filesystem deployments can lose SQLite data after restart/redeploy.
- The interaction endpoint must answer within Discord's initial response deadline. Keep operations quick; for slow external calls, defer the interaction and use the interaction token follow-up flow.
- `better-sqlite3` is a native module. If Replit's build fails, run `npm install` in the Replit Shell on a supported Node.js runtime.

## 1. Create a Discord application
1. Open https://discord.com/developers/applications and create an application named `PEAK CLANS`.
2. Under **General Information**, copy **Application ID** and **Public Key**.
3. Open **Bot**, add a bot if needed, then reset/copy the bot token. Never share the token or commit it to GitHub.
4. Invite the application to your test server using OAuth2 URL Generator with scopes `bot` and `applications.commands`. It needs no privileged Gateway intents for this project. Bot permissions can be minimal for slash commands; Administrator is not recommended.

## 2. Create the Replit project
1. Create a Node.js Repl and upload/extract this ZIP into its root. `package.json` must be in the root.
2. In **Secrets** (lock icon), add:
   - `CLIENT_ID` = Application ID
   - `DISCORD_PUBLIC_KEY` = Public Key from General Information
   - `DISCORD_TOKEN` = Bot token
   - `GUILD_ID` = your test Discord server ID (recommended for quick testing)
3. In the Shell, run:
   ```bash
   npm install
   npm run deploy-commands
   npm start
   ```
4. Open the Replit web preview or the public app URL and check `/health`. It should return `{"ok":true,"service":"peak-clans-http"}`.
5. Copy the public **HTTPS** Replit deployment URL, then open Developer Portal → **General Information** → **Interactions Endpoint URL**. Set it to:
   `https://YOUR-PUBLIC-REPLIT-DOMAIN/interactions`
6. Save. Discord should verify the endpoint by sending a PING; if the endpoint fails verification, check `DISCORD_PUBLIC_KEY`, raw request body handling, and that the service is running.
7. Keep the Replit deployment running. If you change command definitions, run `npm run deploy-commands` again.

## 3. Find your Discord Server ID
Enable Discord User Settings → Advanced → Developer Mode. Right-click the server icon/name → **Copy Server ID**. Put it in `GUILD_ID` in Replit Secrets, then rerun `npm run deploy-commands`.

## 4. Test commands
Try these in the server:
1. `/clan create name:Night Owls tag:NO`
2. Invite someone: `/clan invite user:@Member`
3. Invited member: `/clan join tag:NO`
4. Opponent leader: `/clan create name:Red Wolves tag:RW`
5. Challenge: `/war challenge tag:RW`
6. Accept, play, report: `/war accept id:1`, `/war report id:1 winner_tag:NO`, then a leader/co-leader from the other clan `/war confirm id:1`.
7. `/leaderboard`, `/points`, `/clan members`

War points rule in this build: after both clans confirm a result, the winner gets +10 and the other clan gets +3 participation points.

## 5. Security / operations
- Keep `.env` and all tokens private. Replit Secrets are preferred.
- Never disable signature verification on `/interactions`.
- SQLite file is under `data/peak-clans.sqlite`; back it up before deleting/redeploying.
- For production, use Replit Deployments with persistent storage/volume if available, or move to managed PostgreSQL if you need durable storage and multiple instances.
- Audit records are stored in SQLite. This starter does not post logs to a Discord channel via webhook; that can be configured as an optional extension.
