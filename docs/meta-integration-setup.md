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

## Security notes

- Tokens are encrypted at rest using AES-256-GCM.
- Raw Meta tokens are never returned to the browser.
- OAuth state is single-use and time-limited.
- Webhook events are stored before processing to support idempotency.

## App review notes

In production, Meta may require App Review for Messenger, Instagram Messaging, and WhatsApp-related scopes depending on the exact product configuration.

## Current implementation notes

- The current CRM architecture uses JSON persistence, so webhook ingestion and Meta message storage are database-backed through the existing file model.
- Polling is currently used for the inbox refresh to match the existing application architecture.
- Before going live at scale, consider migrating persistence from JSON storage to a transactional database.
