# Gaming Gamers Discord Bot

A small Discord bot for organizing game invites with reusable templates, queue buttons, and per-game ping roles.

## Features

- `/invite` creates a queue post from a game template
- `/invite` supports an optional `time` in `HH:mm` format using the server's configured timezone
- `/creategame` adds a new game template that becomes available in `/invite`
- `/settimezone` sets which timezone invite times use for the whole server
- `/help` shows the available commands and queue button actions
- Players join the main queue with a button
- Extra players can join the overflow / non-priority lane with a separate button
- `/setrole` sets which role gets pinged for each game template
- Queue state and role mappings are stored in `data/bot-data.json`

## Commands

- `/invite game:apex note:ranked time:19:30 size:3`
- `/settimezone timezone:GMT+8`
- `/creategame name:"Marvel Rivals" size:6 key:marvel-rivals`
- `/setrole game:apex role:@Apex`
- `/queueconfig`
- `/help`

## Setup

1. Put your bot token in `.env` as `TOKEN=...`
2. Invite the bot to your server with `applications.commands` and `bot` scopes
3. Run:

```bash
npm start
```

## Fly.io Persistence

Fly redeploys replace the app container filesystem, so custom games, role mappings, and queue settings will be lost unless you use a volume.

1. Create a volume once in your Fly region:

```bash
fly volumes create bot_data --region sin --size 1
```

2. Deploy with the included `fly.toml`, which mounts that volume at `/data`.

The bot will store `bot-data.json` in `DATA_DIR` when set, so on Fly your data will persist at `/data/bot-data.json` across redeploys.

## Current Templates

- `apex`
- `valorant`
- `cs`
- `aram`
- `arena`
- `amongus`

Built-in templates live in `src/templates.js`, and custom templates created with `/creategame` are stored in `data/bot-data.json`.
