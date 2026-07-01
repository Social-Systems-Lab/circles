# Telegram Notification Forwarding

## What It Does

Telegram notification forwarding sends selected Kamooni notifications to a user's Telegram account.

Current MVP behavior:

- Forwarding is one-way only.
- Users cannot reply from Telegram.
- Only `pm_received` / direct-message notifications are forwarded.
- Kamooni notification creation and chat delivery must not depend on Telegram success.

## User Flow

1. A user opens the Telegram notifications settings card in Kamooni.
2. The user connects their Telegram account through the configured bot.
3. Kamooni stores an external notification channel for that user.
4. When the user receives a supported direct-message notification, Kamooni creates the in-app notification first.
5. Kamooni then attempts Telegram forwarding in the background.

The settings card lives at:

```text
src/app/circles/[handle]/settings/subscription/telegram-notifications-card.tsx
```

## Architecture

Notification creation remains authoritative inside Kamooni. External forwarding is a secondary side effect.

Relevant files:

- `src/lib/data/notifications.ts`
- `src/lib/integrations/telegram.ts`
- `src/app/api/integrations/telegram/webhook/route.ts`
- `src/lib/data/external-notification-channels.ts`
- `src/lib/data/external-notifications.ts`

Important behavior:

- External dispatch is fire-and-forget after `Notifications.insertMany` in `src/lib/data/notifications.ts`.
- Telegram failures must never block Kamooni notification creation.
- Telegram failures must never block chat delivery.
- The Telegram webhook route handles bot callbacks at `/api/integrations/telegram/webhook`.

## Data Model

MongoDB collection:

```text
externalNotificationChannels
```

The channel helpers are:

```text
src/lib/data/external-notification-channels.ts
src/lib/data/external-notifications.ts
```

The channel record links a Kamooni user to an external Telegram destination. Do not store secrets in documentation, logs, or commits.

## Environment Variables

Required environment variables:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET
```

Production bot username:

```text
KamooniBot
```

Never commit or paste real bot tokens or webhook secrets into GitHub issues, docs, logs, or chat.

## BotFather Setup

Use BotFather in Telegram to create or manage the bot.

Production bot:

```text
@KamooniBot
```

BotFather provides the bot token. Store it only in the production environment as `TELEGRAM_BOT_TOKEN`.

Keep the public username in `TELEGRAM_BOT_USERNAME`:

```text
KamooniBot
```

## Production Webhook Setup

Production webhook URL:

```text
https://kamooni.org/api/integrations/telegram/webhook
```

The route is implemented at:

```text
src/app/api/integrations/telegram/webhook/route.ts
```

Use the configured `TELEGRAM_WEBHOOK_SECRET` when registering the webhook. Do not print the bot token while verifying webhook state.

## Deployment Notes

Deploy from the Genesis2 production server.

Run in:

```text
/root/circles/circles
```

Copy-paste command:

```bash
cd /root/circles/circles
./circles/deploy-genesis2.sh main
```

After deployment, verify that the deployed version matches the intended commit.

## Verification Commands

Run on the Genesis2 production server from the nested app directory:

```text
/root/circles/circles/circles
```

Check deployed version:

```bash
curl -sS https://kamooni.org/api/version && echo
```

Check Telegram webhook info without printing the token:

```bash
TOKEN="$(awk -F= '$1=="TELEGRAM_BOT_TOKEN"{print $2}' .env | tr -d '"'\''[:space:]')"
curl -sS "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" && echo
```

Check recent app logs:

```bash
docker compose logs --tail=80 circles
```

## Troubleshooting

If Telegram notifications are not received:

1. Confirm the user has connected Telegram in the settings card.
2. Confirm `externalNotificationChannels` contains the expected user channel.
3. Confirm the notification type is currently supported by the MVP: `pm_received` / direct-message notifications.
4. Confirm `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and `TELEGRAM_WEBHOOK_SECRET` are set in production.
5. Confirm `getWebhookInfo` points to `https://kamooni.org/api/integrations/telegram/webhook`.
6. Check `docker compose logs --tail=80 circles` for webhook or dispatch errors.

If Kamooni in-app notifications or chat delivery fail, do not treat Telegram as the primary suspect. Telegram forwarding is a side effect after Kamooni notification insertion.

## Privacy and Safety Notes

- Telegram forwarding is one-way only.
- Users cannot reply from Telegram.
- Do not send secrets, bot tokens, or webhook secrets to users.
- Keep forwarded content minimal and appropriate for an external messaging service.
- Telegram delivery failures should be logged or tracked, but must not interrupt Kamooni notification creation or chat delivery.
