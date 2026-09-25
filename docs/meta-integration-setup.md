# Meta Integration Setup

## Required environment variables

Add these variables in the server environment:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_CONFIG_ID`
- `META_VERIFY_TOKEN`
- `META_GRAPH_API_VERSION`
- `META_REDIRECT_URI`
- `META_WEBHOOK_URL`
- `TOKEN_ENCRYPTION_KEY`

## Redirect URL

Use:

`http://localhost:4000/api/integrations/meta/oauth/callback`

Replace the host in production with your public API domain.

## Webhook URL

Use:

`http://localhost:4000/api/integrations/meta/webhook`

## Meta products to enable

- Facebook Login for Business
- Webhooks
- WhatsApp
- Messenger
- Instagram Graph API / Instagram Messaging

## Required permissions

- `business_management`
- `pages_show_list`
- `pages_manage_metadata`
- `pages_messaging`
- `instagram_basic`
- `instagram_manage_messages`
- `whatsapp_business_management`
- `whatsapp_business_messaging`

## Connection flow

1. A company admin opens `Settings > Meta`.
2. The CRM starts Meta OAuth from the backend.
3. Meta redirects to the backend callback.
4. The backend exchanges the code securely.
5. The backend discovers pages, Instagram accounts, and WhatsApp assets.
6. The admin chooses which assets to connect to the current company.
7. The CRM stores encrypted provider tokens server-side only.
8. When saving the selected assets, the CRM subscribes each linked Page and WhatsApp Business Account to the app's webhooks. A failed subscription prevents the connection from being reported as successful.

## Messages do not appear

- Environment variables configure the app; they do not connect a company's accounts. Complete `Settings > Meta`, select the accounts, and save them.
- Configure the public callback URL in the Meta app dashboard and verify it with the same `META_VERIFY_TOKEN` as the server. Setting `META_WEBHOOK_URL` alone does not configure Meta.
- Subscribe to the `messages` webhook field for the products in use (Page, Instagram, WhatsApp Business Account).
- Ensure `TOKEN_ENCRYPTION_KEY` is configured with a stable secret; do not change it after tokens have been stored.
- For accounts connected before automatic webhook subscription was added, reconnect through `Settings > Meta` and save the selected accounts again.
- Send a new message from another account to the connected Page/Instagram account/WhatsApp number. This integration receives new webhook events; it does not import historical conversations.
- Check server logs for `event received`, `no connected ... channel matched`, and `event processing failed` to distinguish delivery, account mapping, and storage issues.

## Security notes

- Tokens are encrypted at rest using AES-256-GCM.
- Raw Meta tokens are never returned to the browser.
- OAuth state is single-use and time-limited.
- Webhook events are stored before processing to support idempotency.

## App review notes

In production, Meta may require App Review for Messenger, Instagram Messaging, and WhatsApp-related scopes depending on the exact product configuration.

## Current implementation notes

- Webhook ingestion and Meta message storage use the CRM's MongoDB persistence.
- Polling is currently used for the inbox refresh to match the existing application architecture.
