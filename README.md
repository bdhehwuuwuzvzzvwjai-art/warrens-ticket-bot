# Warren's Script Shop — Ticket Bot

A Discord ticket bot with Purchase and Support ticket types.

## Setup

### 1. Create a Discord Bot
1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it `Warren's Script Shop`
3. Go to **Bot** tab → click **Add Bot**
4. Under **Token** click **Reset Token** and copy it
5. Under **Privileged Gateway Intents** enable:
   - Server Members Intent
   - Message Content Intent
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Administrator` (or at minimum: Manage Channels, Manage Roles, Send Messages, Read Messages, Manage Messages)
7. Copy the generated URL and invite the bot to your server

### 2. Configure the Bot
1. Rename `.env.example` to `.env`
2. Paste your bot token:
   ```
   BOT_TOKEN=your_token_here
   ```

### 3. Run Locally (optional test)
```bash
npm install
npm start
```

### 4. Deploy to Railway
1. Push this folder to a GitHub repo (make sure `.env` is in `.gitignore`)
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Select your repo
4. Go to **Variables** tab and add:
   - `BOT_TOKEN` = your bot token
5. Railway will auto-deploy. Done!

## Usage (in Discord)

| Command | Description |
|---------|-------------|
| `/ticket-panel` | Send the ticket panel (Admins only) |
| `/close` | Close the current ticket channel |
| `/add @user` | Add a user to the current ticket |
| `/remove @user` | Remove a user from the current ticket |

> **Tip:** Create a role named exactly `Support` — members with this role will be able to see and manage all tickets.

## Ticket Panel
Use `/ticket-panel` in your `#tickets` channel. The bot will post the webhook-style embed with the two buttons automatically.
