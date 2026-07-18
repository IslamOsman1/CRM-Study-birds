# Meta Integration Implementation Plan

## Audit Summary

### Current stack
- Frontend: React 19 + Vite + React Router + local component library in `client/src/components/UI.jsx`
- Backend: Express 5 (ESM) + JSON file persistence via `server/src/db.js`
- Auth: JWT bearer auth with role-only claims in `server/src/auth.js`
- Storage: Single shared JSON database in `server/data/db.json`
- File uploads: `multer`
- Password hashing: `bcryptjs`

### Current architecture findings
- The app is currently single-tenant. There is no `companyId` or `tenantId` in:
  - JWT claims
  - users
  - leads
  - students
  - applications
  - invoices
  - activities
  - tasks
- Authorization is role-based only. It does not enforce tenant isolation.
- There is no ORM, migration framework, SQL database, or model layer. Persistence is direct JSON mutation.
- There is no existing chat, conversation, message, inbox, or channel model.
- There is no existing Socket.IO, WebSocket, or SSE implementation.
- There is no encryption utility for provider tokens or secrets.
- There is no background worker or queue. The closest existing async control is the write queue in `server/src/db.js`.
- There is an existing audit/activity log in `db.activities`, but it is generic and not tenant-scoped.
- Notifications currently come from `/api/tasks` and are polled from the frontend every 60 seconds.
- UI design system is custom and should be extended rather than replaced.

### Existing reusable subsystems
- JWT authentication middleware: `server/src/auth.js`
- Role permission model: `client/src/permissions.js`
- Generic activity logging pattern: `activity(...)` in `server/src/index.js`
- Settings module for admin-managed configuration
- Task generation pattern in `buildAutomaticTasks(...)`
- Admissions workflow and documents UI that can be extended toward a future inbox/workspace

## Major constraint

The requested Meta integration is a real multi-tenant SaaS integration, but the current CRM is not multi-tenant yet.

Because of that, implementation must begin with a safe tenant foundation before any Meta OAuth, token storage, webhook routing, or inbox work. Without that layer, strict company-level isolation cannot be guaranteed.

## Recommended implementation phases for this codebase

### Phase 1: Tenant foundation
- Introduce `companies` collection in `db.json`
- Add `companyId` to:
  - users
  - employees
  - leads
  - students
  - applications
  - reception logs
  - attendance
  - invoices
  - payments
  - activities
  - tasks
  - future integration entities
- Extend JWT payload with `companyId`
- Add backend helpers:
  - `requireCompanyContext`
  - `assertCompanyAccess`
  - tenant-scoped query helpers
- Update all existing CRUD endpoints to enforce company isolation
- Seed current data into a default company so existing features continue to work

### Phase 2: Configuration and security primitives
- Add server env config for:
  - `META_APP_ID`
  - `META_APP_SECRET`
  - `META_CONFIG_ID`
  - `META_VERIFY_TOKEN`
  - `META_GRAPH_API_VERSION`
  - `META_REDIRECT_URI`
  - `META_WEBHOOK_URL`
  - `TOKEN_ENCRYPTION_KEY`
- Add `.env.example` entries only
- Implement backend-only encryption utility using AES-256-GCM
- Add secure token masking utilities for admin responses
- Add centralized Meta config loader

### Phase 3: Data model extension
- Add JSON-backed collections for:
  - `metaIntegrations`
  - `connectedChannels`
  - `conversations`
  - `messages`
  - `webhookEvents`
  - `whatsAppTemplates`
  - `integrationAuditLogs`
  - optional `contactChannelIdentities`
- Add normalized status fields and lookup indexes in code
- Add backward-compatible data initialization in `prepareDb()`

### Phase 4: Meta OAuth and self-service onboarding
- Add backend services under `server/src/integrations/meta/`
- Implement:
  - OAuth state generation and storage
  - callback validation
  - code exchange
  - asset discovery
  - channel selection
  - secure persistence
- Add admin UI under Settings > Integrations > Meta

### Phase 5: Webhook ingestion and idempotent processing
- Add:
  - `GET /api/integrations/meta/webhook`
  - `POST /api/integrations/meta/webhook`
- Store incoming events before processing
- Add deterministic deduplication
- Resolve tenant by connected asset identifiers
- Process webhook work through a database-backed async job pattern suitable for this repo

### Phase 6: Provider channel support
- WhatsApp Cloud API
- Facebook Messenger
- Instagram Messaging
- Shared message normalization and contact resolution

### Phase 7: Unified inbox
- Add channel-aware conversation list and message thread views
- Reuse existing page/component patterns
- Start with polling-based refresh to match current architecture
- Optionally add SSE later if needed, but only after tenant-safe event boundaries are in place

### Phase 8: Operations and resilience
- Disconnect / reconnect
- Health checks
- Token validation jobs
- Template sync
- Provider error mapping
- Integration audit logs

### Phase 9: Testing and docs
- Add focused backend tests first around:
  - tenant isolation
  - OAuth state
  - encryption
  - webhook idempotency
  - channel resolution
- Add setup guide in `docs/meta-integration-setup.md`

## Important assumptions

- The current project can be evolved incrementally without replacing Express or React.
- JSON storage is acceptable for the current repository state, but it is not ideal for production-scale webhook ingestion.
- Real-time delivery should initially reuse the existing polling model unless a lightweight tenant-scoped SSE layer becomes necessary.
- Existing Arabic UI direction and styling must be preserved.
- Existing roles will need an additional integration-management capability, likely mapped to `admin` and `management` first.

## Risks

- The largest technical risk is introducing tenant isolation into a codebase that is currently global-state by design.
- JSON file storage may become a bottleneck for webhook bursts, retries, and idempotency tracking.
- Meta onboarding for WhatsApp, Messenger, and Instagram has provider-side eligibility constraints that must be surfaced cleanly in the UI.

## Immediate next implementation step

Implement Phase 1 first:
- add `companies`
- add `companyId` everywhere
- update auth token payload
- harden all API reads/writes to tenant scope

No Meta integration work should proceed before this is in place.
