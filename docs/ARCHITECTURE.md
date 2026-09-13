# Architecture and maintenance

## How a request moves through the system

The browser loads HTML, CSS and JavaScript from the same Node.js server that serves `/api/*`. Browser writes send JSON, an origin check header and, for signed-in sessions, a CSRF token. The server authenticates the session, validates the input, checks record ownership and workflow state, then changes SQLite inside a transaction. The browser shows success only after the server responds.

Files are database blobs, with separate metadata and version numbers. Their download routes verify project access before serving bytes. There is no public upload directory or predictable public file link.

The app intentionally has no third-party runtime packages, bundler or external font/analytics requests. This keeps local setup small and code review direct. It does mean that HTTP routing, access control and validation are maintained in this repository and must be reviewed carefully when extended. The Node runtime is still a dependency that needs updates.

## Files and boundaries

| Area | Files and behaviour |
|---|---|
| Startup | `server.mjs`: bind configured host/port and close on shutdown |
| HTTP and workflows | `src/app.mjs`: static allowlist, session checks, role/assignment checks, route handlers, transactional workflow changes |
| Data | `src/db.mjs`: SQLite schema, WAL mode, foreign keys, event insertion and transaction wrapper |
| Security helpers | `src/security.mjs`: scrypt password hashing, cryptographic tokens, SHA-256 token lookup, text/email validation, file signatures and size limits, rate limiting |
| Interface | `public/app.js`: escaped HTML templates, views, form submission, navigation, receipts and dialogs |
| Styles | `public/styles.css`: design tokens, shared components and responsive breakpoints |
| Operations | `scripts/user.mjs`, `scripts/demo.mjs`, `scripts/backup.mjs` |

## Database

`data/gala.sqlite` is the normal local database. The demo uses `data/demo/gala.sqlite`. `DATA_DIR` selects another folder. SQLite may create `gala.sqlite-wal` and `gala.sqlite-shm` alongside the main database while running; use the backup command instead of copying just the live main file.

| Table | Purpose |
|---|---|
| `projects` | Customer snapshot, original/current requirements, service, reference, status, assignment, due date, version, access-code hash, latest/approved draft IDs |
| `files` | Reference and numbered draft files, MIME type, bytes, note, project link and timestamp |
| `revisions` | Feedback, before/after requirements, related draft, creation and resolution dates |
| `approvals` | Immutable customer approval records linked to a draft |
| `events` | Project timeline, actor, timestamp and staff-only visibility flag |
| `users` | Staff/owner accounts, password hashes and activation state |
| `sessions` | Hashed session token, staff or customer-project identity, CSRF token, eight-hour expiry |
| `settings` | Schema version and explicit demo marker |

All schema declarations are visible in `src/db.mjs`. This is version 1, with idempotent initial creation. Future changes to existing columns must introduce explicit versioned migrations; editing `CREATE TABLE IF NOT EXISTS` alone will not migrate a deployed database.

## API overview

Use the UI for normal operations. API tests in `tests/workflow.test.mjs` demonstrate the request contract.

| Method/path | Who / result |
|---|---|
| `GET /api/session` | Current public session summary and service/status definitions |
| `POST /api/requests` | Public validated request, optional file, private access receipt |
| `POST /api/track` | Exchange reference + access code for a project session |
| `POST /api/login`, `/api/logout` | Staff login or session logout |
| `GET /api/projects` | Owner's full queue or assigned staff queue |
| `GET /api/projects/:id` | Authorised detail; staff-only events removed for customers |
| `GET /api/files/:id` | Authorised design/reference bytes; `?download` requests an attachment |
| `POST /api/projects/:id/status` | Staff permitted state change |
| `POST /api/projects/:id/drafts` | Staff versioned draft upload and transition to Review |
| `POST /api/projects/:id/revisions` | Customer feedback and optional changed requirements |
| `POST /api/projects/:id/approve` | Customer explicit approval of the current draft |
| `POST /api/projects/:id/assignment` | Owner assignment and due date |
| `POST /api/projects/:id/notes` | Staff-only note |
| `POST /api/projects/:id/access-code` | Owner code rotation and customer session invalidation |
| `POST /api/projects/:id/reopen` | Owner reopening with reason; clears current approval |
| `GET/POST /api/team`, `PATCH /api/team/:id` | Owner team management |
| `POST /api/password` | Staff password change using current password |
| `GET /healthz` | Database availability check |

Every project mutation supplies the current integer `version`. A stale version returns 409. Files are JSON objects `{name, data}` with base64 bytes; the request body is limited to 7 MB and the decoded file to 5 MB. Only PNG/JPEG/WebP/PDF signatures are accepted. PDFs download as attachments instead of embedded active content.

## State rules

- New → In Progress by staff.
- In Progress → Review by sharing a draft.
- Review → Revision Requested by customer feedback; requests may also be revised earlier in the workflow.
- Revision Requested → In Progress by staff, or directly → Review when staff share a revised draft.
- Review → Review when staff replace a draft; version checks protect a concurrent customer's stale approval.
- Review → Approved only by the customer with an explicit confirmation and the latest draft ID.
- Approved → Completed only when that same draft remains approved.
- Approved/Completed → In Progress only when an owner reopens with a reason. Previous approval records are retained, but no longer authorise completion.

Staff cannot skip directly to Review, Approved or Completed from earlier states. Owner status does not bypass customer approval. Customer access codes are bearer credentials; possession of the receipt establishes project access, not verified personal identity. Do not describe this as email-verified customer authentication or a legally certified digital signature.

## Operations and future work

The included UI deliberately preserves records. It has no destructive project deletion button. If data correction/removal is needed, design an explicit, authorised retention workflow with backups and auditability rather than deleting production rows ad hoc.

Sessions expire after eight hours and are revoked on staff deactivation/password changes or customer-code rotation. There is one session per browser profile, so customer/staff comparisons require separate browser contexts. No cross-tab live session notice or automatic project refresh is implemented.

The rate limiter is per server process and not shared across replicas. No CAPTCHA, malware scanning, antivirus pipeline, email delivery, email verification, self-service account recovery, multi-factor authentication, external integration, CSV import/export UI, or automated backup scheduler is included. The supplied source archive did not contain real records to migrate.

For ongoing work, keep changes small: identify the expected behaviour, edit the relevant view/API function, update a meaningful workflow test, run tests, then verify the changed screen. Review the Git diff before publishing. Keep a staging database separate from production. A larger version should introduce PostgreSQL, private object storage, a migration system and modular API/view files as needed by actual scale.
