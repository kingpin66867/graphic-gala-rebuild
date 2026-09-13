# The Graphic Gala — editable rebuild

A working reconstruction of the Graphic Gala design-request system, built from the supplied Part II report, screenshots and Glide configuration. You own the frontend, server, database schema, tests, and deployment configuration. No Glide subscription or Google Sheets connection is required.

**Start with the demo.** It contains fictional projects and separate local data. This release has been tested locally; it has not been deployed to a public host.

## 1. Open the demo on Windows

1. Extract the ZIP to a permanent folder if you downloaded the packaged version.
2. Open the `graphic-gala` folder.
3. Double-click **start-demo.cmd**. Keep its terminal window open.
4. Open **http://localhost:3000** in your browser. Use `localhost`, not `127.0.0.1`, because the security configuration checks the address.
5. Choose **Staff sign in** to try the staff workspace, or **New request** to try the customer experience.

The launcher uses an installed Node.js or the Codex runtime available on this computer. On other computers, install **Node.js 24.14 or later within the 24.x release line** from [Node.js](https://nodejs.org/en/download). This build was tested on 24.19.0. The project uses Node's built-in SQLite support. [Node SQLite documentation](https://nodejs.org/api/sqlite.html).

| Demo role | Sign-in | Password / access code |
|---|---|---|
| Owner | `owner@graphicgala.test` | `GalaDemo!2026` |
| Assigned designer | `designer@graphicgala.test` | `GalaDemo!2026` |
| Customer, ready-to-review sample | Reference `GG1005` on **Track project** | `GalaCustomerDemo2026` |

The demo owner sees all projects. The designer sees only assigned projects. The sample customer code works for the eight seeded projects; new requests receive their own random code. In the already-running local demo, verification added the fictional request GG1009 and completed GG1005. A fresh extraction starts with the original eight samples; you can also submit a new request to test the full workflow.

To stop, press **Ctrl+C** in the terminal. Run the launcher again to resume with saved data. If port 3000 is already in use by this demo, use the existing browser page instead of starting a second copy.

## 2. Run with terminal commands

Install Node.js 24, then open a terminal in the `graphic-gala` folder. Confirm the version:

```powershell
node --version
npm --version
```

Start the demo:

```powershell
npm run demo
```

There are no external runtime packages to install. If PowerShell blocks `npm.ps1`, use `npm.cmd run demo`. All npm commands below have the same `npm.cmd` equivalent.

## 3. Test a complete project

Use one ordinary browser window for the owner and a private/incognito window for the customer. Tabs in the same browser session share sign-in cookies, so switching roles in one tab also changes the other tabs.

1. **Customer:** choose **New request**. Leave Phone blank and try submitting. The request must be blocked. Fill all required fields, select a service, add your brief, and optionally attach a reference file.
2. Submit successfully and choose **Save request receipt**. This contains the reference and private access code. The app does not email this code.
3. **Owner:** sign in, open **Project queue**, and find that reference. Open it and assign a designer under **Project planning**. Set a due date if useful.
4. Choose **Start design work**. Then select a PNG, JPG, WebP, or PDF under **Upload a new draft**, add a note, and choose **Share draft for review**. Files are limited to 5 MB.
5. **Customer:** open **Track project** with the reference and code, or refresh the already-open project. Review or download the design. Choose **Request revision**, describe the change, optionally update the requirements, and submit.
6. **Staff:** open **Revisions**, inspect the before/after requirements, and upload a revised draft. Earlier files and revision history remain available. A new draft marks open revisions as addressed.
7. **Customer:** refresh the project, review the latest draft, and choose **Approve design**. Tick the explicit confirmation and choose **Confirm approval**.
8. **Staff:** refresh the project and choose **Mark as completed**. It moves to Completed. The customer can still retrieve the design and its history.
9. **Owner, optional:** reopen the completed project with a reason. Previous approval stays in the history, but a new draft and new customer approval are needed to complete it again.

For the broader manual checklist and expected results, see [Testing](docs/TESTING.md).

## 4. Run automated checks

In a second terminal in the project folder:

```powershell
npm test
```

The tests use temporary databases and local random ports. They do not alter your demo or real database. Seven grouped integration tests cover the four workflows, access boundaries, validation, revision and approval rules, account management, stale updates, persistence, and security headers. See [test results and limits](docs/TESTING.md).

## 5. Start a clean workspace

Stop the demo first. These steps create a separate database in `data`, without the fictional sample records.

1. Copy the example settings:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Create your owner account. Replace the example email and name:

   ```powershell
   npm run user -- --email you@example.com --name "Studio Owner" --role owner
   ```

   Enter a unique password of at least 12 characters when prompted. Typing is hidden. Never put a real password in a command argument or commit it to GitHub.

3. Start the clean application:

   ```powershell
   npm start
   ```

4. Open **http://localhost:3000**, sign in as your new owner, and use **Team** to add designers. Team members can change their password under **Account**.
5. Submit a test request and complete the workflow before entering real work.

For local development with server reloads, use `npm run dev`. Refresh your browser after frontend edits.

## 6. Deploy for public access later

Follow [the deployment guide](docs/DEPLOYMENT.md) after you have reviewed the local app. It provides the GitHub steps, Render configuration, first owner setup, public checks, backups, and recovery instructions. `render.yaml` and a `Dockerfile` are included.

This app needs a running server and persistent storage. GitHub Pages or a static-only hosting plan cannot run it. A public URL makes the request portal accessible; project records still require customer access codes or authorised staff sign-in.

## What is included

- Customer service portal and validated design-request form.
- Unique project references and private, downloadable access receipts.
- Owner and staff sign-in, team accounts, password changes, and account deactivation.
- Dashboard metrics, workflow board, search, filters, assignments, and due dates.
- Private reference files, versioned drafts, download links, and a customer review screen.
- Revisions with feedback, before/after requirements, and retained history.
- Explicit customer approval, completion rules, and owner reopening with a reason.
- Staff-only notes, customer-visible activity, and a backup command.
- Responsive desktop/mobile screens and keyboard-accessible native controls.

## Important differences from the original

The supplied GitHub ZIP contains documents, not exported source code or database rows. This is a reconstruction, not a recovered Glide application or a real-data migration. The visual design is refreshed while preserving the demonstrated workflows.

The report calls the data store Google Sheets; the supplied deployment guide says Glide Tables. No live integration is assumed. This rebuild stores project records and files together in a server-side SQLite database. Customer details are stored as a project snapshot rather than a shared customer account, to avoid accidentally merging unrelated customers who enter the same email.

There is no email/SMS delivery, email verification, self-service password recovery, payment system, accounting, analytics tracker, or live connection to Glide. Notifications are represented by the revision queue, workflow states, and activity timeline. Pages update when opened or refreshed; there is no live push refresh. The current server is intended for one modest studio on one server instance. See [architecture and limitations](docs/ARCHITECTURE.md).

## Where to change things

| File | Responsibility |
|---|---|
| `public/app.js` | Screens, forms, navigation and browser behaviour |
| `public/styles.css` | Colours, spacing, layout and responsive rules |
| `public/index.html`, `public/favicon.svg` | Page entry and brand mark |
| `src/app.mjs` | HTTP/API routes, access controls and workflow rules |
| `src/db.mjs` | Database schema and transactions |
| `src/security.mjs` | Passwords, input validation, file validation and rate limits |
| `scripts/user.mjs` | Initial owner creation and password recovery |
| `scripts/backup.mjs` | Consistent database backup, including uploaded files |
| `tests/workflow.test.mjs` | Integration tests |
| `docs/RECONSTRUCTION.md` | Source evidence, scope decisions and requirement mapping |

Keep `data`, backups and `.env` out of version control. The source package deliberately excludes them.
