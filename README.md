# Gold & Black Clan Bot

A Discord bot for posting and managing clan-style embeds — team roster,
"About Us" posts, and wipe summaries — all themed in gold (`#D4AF37`) on
Discord's black/dark background, similar to the RT Team / wK style posts.

## Features

- **`/roster setup <title>`** — posts a roster embed (e.g. "ROI TEAM")
- **`/roster add <user> <role>`** — adds a member with a role (CALLER, BUILDER, SUPPORT, etc.) and auto-updates the embed
- **`/roster remove <user>`** — removes a member from the roster
- **`/roster refresh`** — re-renders the roster embed (useful if it gets out of sync)
- **`/links discord telegram youtube`** — sets link buttons shown under the roster
- **`/about title description [banner] [thumbnail]`** — posts an "About Us" style embed with an optional banner/GIF and logo
- **`/wipe title description [stats] [image1-4]`** — posts a wipe summary/achievement embed with optional stat lines and up to 4 images

All embeds use a gold accent color and work with Discord's dark theme to
give the same "gold & black" look as the reference screenshots.

## Setup

### 1. Create the bot application

1. Go to https://discord.com/developers/applications
2. Click **New Application**, give it a name
3. Go to the **Bot** tab → click **Reset Token** → copy the token (you'll only see it once)
4. Under **Privileged Gateway Intents**, you don't need to enable any extra intents for this bot
5. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`
   - Open the generated URL and invite the bot to your server

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in:
- `DISCORD_TOKEN` — the bot token from step 1
- `CLIENT_ID` — your application's "Application ID" (found on the General Information tab)
- `GUILD_ID` — (optional, recommended while testing) your server's ID, for instant command registration. Right-click your server icon → Copy Server ID (requires Developer Mode enabled in Discord settings)

### 3. Install dependencies

```bash
npm install
```

### 4. Register slash commands

```bash
npm run deploy
```

### 5. Start the bot

```bash
npm start
```

## Usage examples

```
/roster setup title:ROI TEAM
/roster add user:@SomePlayer role:Caller
/roster add user:@AnotherPlayer role:Main Role
/links discord:https://discord.gg/yourinvite youtube:https://youtube.com/yourchannel

/about title:Our history and mission description:Our team was founded in 2020...\nDuring this time we competed at the highest level.

/wipe title:FEBRUARY FORCE WIPE - ATLAS US MONTHLY description:Big win this wipe! stats:Rockets shot: 12,000\nPrize pool: $2,000 image1:[attach a screenshot]
```

## Notes & customization

- Change the gold/black colors in `theme.js` (`GOLD`, `BLACK`, `DIVIDER`).
- Roster and link data are stored per-server in `data/<guild_id>.json`. Back this up if you redeploy.
- Only members with **Manage Server** permission can use these commands (controlled via `setDefaultMemberPermissions` in each command file — adjust if you want a different role to manage it).
- For `/wipe`, additional images beyond the first are sent as separate stacked embeds (Discord doesn't support multi-image galleries from attachments in a single embed via the API the way the gallery carousel in image 4/5 does).
