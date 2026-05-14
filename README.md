# Vajra Acharya Telegram Agent

Standalone Next.js app for the Vajra Acharya Telegram bot.

It connects to the same Supabase project and schemas as the main web app, so learner profiles, course progress, chat logs, apply logs, quiz attempts, modules, and sections stay shared.

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/api/telegram/webhook
```

## Required Environment

Use the same Supabase values as the main Vajra Acharya app:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_PLATFORM_SCHEMA=public
NEXT_PUBLIC_ACHARYA_SCHEMA=public
NEXT_PUBLIC_ACHARYA_SLUG=vajra
GOOGLE_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-only. Do not expose it as a `NEXT_PUBLIC_` variable.

## Supabase Table

The Telegram account link table is in:

```text
supabase/telegram-bot-integration.sql
```

Run it only if `telegram_accounts` does not exist in your platform schema.

## Vercel Deployment

Create a separate Vercel project from this folder and add the same environment variables above.

After deployment, set the Telegram webhook:

```powershell
$token="YOUR_TELEGRAM_BOT_TOKEN"
$secret="YOUR_TELEGRAM_WEBHOOK_SECRET"
$url="https://YOUR-TELEGRAM-AGENT.vercel.app/api/telegram/webhook"

Invoke-RestMethod `
  -Uri "https://api.telegram.org/bot$token/setWebhook" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{
    url = $url
    secret_token = $secret
    allowed_updates = @("message", "callback_query")
    drop_pending_updates = $true
  } | ConvertTo-Json)
```

Verify webhook status:

```powershell
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
```
