# Public deployment, after local acceptance

The app has **not** been deployed publicly. This guide prepares a later deployment, after the owner accepts the workflows and branding. The included Render configuration targets a single Node.js service with a persistent SQLite database. Hosting purchases, account connections and domain changes are not part of the local rebuild.

## A. Before publishing

1. Run `npm test` and the customer/staff walkthrough in the README.
2. Confirm the four services, contact process and approval language with the business.
3. Decide how customers will contact the studio when they lose an access receipt. The app currently refers to their existing contact channel; it does not invent a phone number or email address.
4. Decide who will maintain the server, update Node.js, review failures, and back up and recover data.
5. Use a clean production database. The server refuses to use demo-marked data in production.
6. Review customer data retention, public request abuse, and handling of uploaded files for your actual usage. File signatures and size limits are checked; malware scanning is not included. A production security review and staging test remain necessary before broad use.

## B. Put the code in your GitHub repository

Create a **new private repository** for this rebuild initially, keeping the old reference repository intact. From a clean extracted project folder:

```powershell
git init
git add .
git status
git commit -m "Rebuild Graphic Gala request and design workflow"
git branch -M main
```

Inspect the staged list before committing. It should contain code, tests and documentation, with no `.env`, customer receipts, `data` or backup files. The included `.gitignore` excludes the normal runtime folders. Avoid uploading the entire parent Codex folder.

After creating the empty repository on GitHub, replace the URL below with the URL GitHub gives you:

```powershell
git remote add origin https://github.com/YOUR-ACCOUNT/graphic-gala.git
git push -u origin main
```

This step requires your own GitHub sign-in. The repository can remain private while the application is public.

## C. Create a Render service

Render is one deployment option chosen for this app, not a required vendor. It supports Node services from connected repositories and HTTPS public addresses. [Render web services](https://render.com/docs/web-services).

1. Sign in to Render and connect the repository you just created.
2. Create a new **Web Service**, using the Node runtime and the `main` branch.
3. Apply the settings below. Leave the root directory blank if `package.json` is at the repository root. If you intentionally uploaded a containing folder, point the root directory at `graphic-gala`.

| Setting | Value for this app |
|---|---|
| Build command | `npm ci && npm test` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Node version environment variable | `NODE_VERSION=24.19.0` |
| Runtime mode | `NODE_ENV=production` |
| Bind address | `HOST=0.0.0.0` |
| Database folder | `DATA_DIR=/var/data/graphic-gala` |
| App address | `APP_ORIGIN=https://YOUR-SERVICE.onrender.com` |
| Persistent disk mount | `/var/data` |
| Number of instances | One |

Use the actual HTTPS address assigned to the service for `APP_ORIGIN`, with no trailing slash or path. If the URL becomes known only after service creation, update that variable before testing forms. The application reads Render's `PORT` automatically.

Choose a paid service plan that supports a persistent disk. Only files under the disk mount survive restarts and deployments; an ephemeral filesystem is unsuitable for this SQLite app. This is why `DATA_DIR` must remain under `/var/data`. Confirm current prices before purchasing. [Render persistent disks](https://render.com/docs/disks).

The included `render.yaml` encodes these settings as a Blueprint and asks you to supply `APP_ORIGIN`. You can use the Blueprint flow instead of entering the same settings manually. [Render Blueprint reference](https://render.com/docs/blueprint-spec).

## D. Create the first production owner

After the service starts, open its shell from the hosting dashboard. Run:

```sh
node scripts/user.mjs --email you@example.com --name "Studio Owner" --role owner
```

Use your real business sign-in address. Enter your chosen password at the hidden prompt. The command creates the account in the mounted database using the service's `DATA_DIR`; it does not display the password.

If the host shell does not support an interactive password prompt, the script supports a temporary `GALA_USER_PASSWORD` environment variable. Set it through the provider's secret interface, run the command, and remove the variable immediately afterward. Do not type a real password directly into a shell command, commit it, or leave it in a build log.

Open the public URL, select **Staff sign in**, and log in. Add the rest of the team from **Team**. All accounts in a clean production database must be created explicitly; demo credentials do not exist there.

## E. Check the hosted application

1. Open `/healthz`. It should return `{"status":"ok"}`.
2. Use a private browser window to submit a fictional request. Save its receipt.
3. Use a separate browser session to sign in as owner, assign it and upload a small test design.
4. Retrieve the project as customer, request a revision, then review the new draft and approve it. Complete it as staff.
5. Verify an unauthenticated browser cannot open the copied private file URL. Verify one customer cannot use their session to open another project.
6. Restart or redeploy the service. Verify the test project and uploaded files still exist.
7. Run a backup and restore it into a separate local test directory. Confirm the project, files and history are readable.
8. Verify a phone browser and the browsers your staff actually use.
9. Replace placeholder contact guidance and demo-style branding copy with approved business details before sharing the address broadly.

If using a custom domain, configure it with the host, then change `APP_ORIGIN` to that exact HTTPS origin and make it the canonical address. The app accepts mutations from only that configured origin. Existing bookmarks to another domain should be redirected. Do not disable the origin check to fix an address mismatch.

## F. Backups and restoration

Run from the project folder with `DATA_DIR` pointing to the database you intend to back up:

```sh
npm run backup
```

The command uses SQLite's backup API and includes file contents, projects, users, and history. It writes a timestamped database under `backups` unless `BACKUP_DIR` is set. Store a protected copy **off the app server**; backups on the same disk are not disaster recovery. Automate backup scheduling using your chosen host's supported method once your retention and recovery needs are agreed. This rebuild does not silently create a schedule.

For the local demo specifically, in PowerShell:

```powershell
$env:DATA_DIR = './data/demo'
npm run backup
Remove-Item Env:DATA_DIR
```

To test restoring a backup without overwriting live data:

1. Create a **new, empty folder**, for example `data/restore-check`.
2. Copy the selected backup into it and name the copy `gala.sqlite`.
3. Set `DATA_DIR` to that folder and start a separate test instance, or stop the existing local app first. Use development mode and `http://localhost:3000` locally.
4. Sign in and inspect projects, files, revision history, and approval history.

For a real recovery, stop the service, preserve the damaged database and any `-wal`/`-shm` files together for investigation, then restore into a new empty data directory. Never combine an old backup with WAL files from a different database. Change `DATA_DIR` to the restored location and start one instance. Invalidate restored sessions and review whether recent credentials or access codes need to be replaced. Maintain a written recovery record.

Code rollback is separate from data recovery. Do not restore yesterday's database just to revert a styling change. Before future schema changes, take a backup and write a forward migration; rollback compatibility needs explicit review.

## G. Ongoing maintenance

- Run the tests before merging changes. Check a real request/revision/approval flow in staging after meaningful workflow changes.
- Back up according to your agreed recovery target, test restoration periodically, and monitor available disk space. File blobs count toward the same database size.
- Keep the Node 24 runtime patched and re-run tests after updating it. Reassess the runtime and SQLite API before moving to another major version.
- Disable departed staff under **Team**, then reassign their open projects. Deactivation invalidates their sessions.
- Reset a forgotten staff password with `npm run user -- --email user@example.com --reset` in the appropriate environment. It preserves role and account activation state and invalidates sessions.
- Review access-code replacement requests through a verified business contact channel.

## Scale and infrastructure limits

SQLite and stored file blobs keep a small deployment simple. This implementation uses synchronous database calls, a single server process, and a single persistent disk. Do not configure multiple replicas, serverless functions, or a network-shared SQLite file for it. Use a PostgreSQL migration and private object storage if workload or attachment volume grows substantially. This migration is not included.

Rate limits are held in memory and use the socket peer address; behind a reverse proxy, multiple visitors may share a limit. Account sign-in is also limited by email. Do not blindly trust forwarded IP headers. For a broader public launch, add trusted-proxy-aware rate limiting or a provider edge policy, plus public-submission abuse controls, and test the chosen topology.

The Dockerfile is an alternative packaging option for an operator who already runs containers. It still requires a persistent writable volume, HTTPS termination, the exact `APP_ORIGIN`, backups, and explicit owner setup. Neither a Docker build nor a hosted Render deployment has been executed during the local rebuild.
