# Gaming Gamers Discord Bot

A small Discord bot for organizing game invites with reusable templates, queue buttons, and per-game ping roles.

## Features

- `/invite` creates a queue post from a game template
- Players join the main queue with a button
- Extra players can join the overflow / non-priority lane with a separate button
- `/setrole` sets which role gets pinged for each game template
- Queue state and role mappings are stored in `data/bot-data.json`

## Commands

- `/invite game:apex note:ranked size:3`
- `/setrole game:apex role:@Apex`
- `/queueconfig game:apex`

## Setup

1. Put your bot token in `.env` as `TOKEN=...`
2. Invite the bot to your server with `applications.commands` and `bot` scopes
3. Run:

```bash
npm start
```

## Current Templates

- `apex`
- `valorant`
- `league`

You can add more in `src/templates.js`.
