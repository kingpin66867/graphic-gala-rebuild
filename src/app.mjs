import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, transaction, now, event } from './db.mjs';
import { secret, digest, verifyPassword, hashPassword, HttpError, requireThat, text, email, upload, rateLimiter } from './security.mjs';

export const SERVICES = ['Packaging', 'Logo Design', 'Digital graphics', 'Print collateral'];
export const STATUSES = ['New', 'In Progress', 'Review', 'Revision Requested', 'Approved', 'Completed'];
export function createApp(options = {}) {
  const db = openDb(options.dataDir);
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const origin = options.origin || process.env.APP_ORIGIN || 'http://localhost:3000';
  const demo = db.prepare("SELECT value FROM settings WHERE key='demo'").get()?.value === 'true';
  if (production && (!origin.startsWith('https://') || demo)) {
    db.close();
    throw new Error('Production requires an HTTPS APP_ORIGIN and a clean database without demo data.');
  }
  const limit = rateLimiter();
  const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
  ]);
  const actor = session => session.user?.name || 'Customer';
  const staff = session => requireThat(session?.user, 403, 'Staff sign-in is required.');
  const owner = session => requireThat(session?.user?.role === 'owner', 403, 'Owner access is required.');
  function getProject(id, session) {
    requireThat(session, 401, 'Please sign in or enter your project access code.');
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    requireThat(project && (session.user?.role === 'owner' || (session.user && project.assigned_to === session.user.id) || session.project_id === project.id), 404, 'Project not found or access is unavailable.');
    return project;
  }
  function detail(project, session) {
    const { access_hash, ...safe } = project;
    safe.assigned_name = project.assigned_to ? db.prepare('SELECT name FROM users WHERE id=?').get(project.assigned_to)?.name : null;
    safe.files = db.prepare('SELECT id,name,mime,kind,version,note,created_at FROM files WHERE project_id=? ORDER BY id DESC').all(project.id);
    safe.revisions = db.prepare('SELECT * FROM revisions WHERE project_id=? ORDER BY id DESC').all(project.id);
    safe.approvals = db.prepare('SELECT * FROM approvals WHERE project_id=? ORDER BY id DESC').all(project.id);
    safe.events = db.prepare('SELECT id,actor,message,private,created_at FROM events WHERE project_id=? AND (private=0 OR ?=1) ORDER BY id DESC').all(project.id, +!!session.user);
    return safe;
  }
  function sessionFor(req) {
    const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('gg_session='))?.slice(11);
    if (!cookie) return null;
    const s = db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(cookie), Date.now());
    if (!s) return null;
    if (s.user_id) {
      s.user = db.prepare('SELECT id,name,email,role FROM users WHERE id=? AND active=1').get(s.user_id);
      if (!s.user) return null;
    }
    return s;
  }
  function newSession(res, userId, projectId, oldSession) {
    if (oldSession) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(oldSession.token_hash);
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    const token = secret(), csrf = secret();
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(digest(token), userId, projectId, csrf, Date.now() + 8 * 3600_000);
    res.setHeader('Set-Cookie', `gg_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${production ? '; Secure' : ''}`);
    return csrf;
  }
  function saveFile(projectId, file, kind, version = null, note = '') {
    return Number(db.prepare('INSERT INTO files(project_id,name,mime,data,kind,version,note,created_at) VALUES(?,?,?,?,?,?,?,?)').run(projectId, file.name, file.mime, file.data, kind, version, note, now()).lastInsertRowid);
  }
  function versionCheck(p, body) {
    requireThat(Number.isInteger(body.version) && body.version === p.version, 409, 'This project changed since you opened it. Refresh the project and try again.');
  }
  function touch(id) { db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(), id); }
  async function bodyOf(req) {
    requireThat(req.headers['content-type']?.startsWith('application/json'), 415, 'Send JSON data.');
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      requireThat(size <= 7 * 1024 * 1024, 413, 'Request is too large. Maximum file size is 5 MB.');
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'Invalid request data.'); }
    requireThat(body && typeof body === 'object' && !Array.isArray(body), 400, 'Invalid request data.');
    return body;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, origin), path = url.pathname, method = req.method;
      if (method === 'GET' && staticFiles.has(path)) {
        const [file, type] = staticFiles.get(path);
        res.writeHead(200, { 'Content-Type': type });
        return res.end(readFileSync(fileURLToPath(new URL(`../public/${file}`, import.meta.url))));
      }
      if (method === 'GET' && path === '/healthz') { db.prepare('SELECT 1').get(); return json(200, { status: 'ok' }); }
      const s = sessionFor(req);
      if (method === 'GET' && path === '/api/session') return json(200, { user: s?.user || null, projectId: s?.project_id || null, csrf: s?.csrf || null, demo, services: SERVICES, statuses: STATUSES });
      const mutating = ['POST', 'PATCH', 'DELETE'].includes(method);
      if (mutating) {
        requireThat(req.headers.origin === origin, 403, 'Request origin is not allowed. Open the app at its configured address.');
        requireThat(req.headers['x-gala-request'] === '1', 403, 'Missing request verification.');
        if (s) requireThat(req.headers['x-csrf-token'] === s.csrf, 403, 'Your session changed. Reload this page and try again.');
      }
      if (method === 'POST' && path === '/api/login') {
        limit(`login:${req.socket.remoteAddress}`, 30);
        const b = await bodyOf(req), address = email(b.email), password = text(b.password, 'Password', 256);
        limit(`account:${address}`, 10);
        const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(address);
        // Always perform the slow password check, including unknown accounts.
        const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
        const valid = await verifyPassword(password, user?.password_hash || dummy);
        requireThat(user && valid, 401, 'Email or password is incorrect.');
        const csrf = newSession(res, user.id, null, s);
        return json(200, { csrf, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
      }
      if (method === 'POST' && path === '/api/logout') {
        if (s) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash);
        res.setHeader('Set-Cookie', `gg_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? '; Secure' : ''}`);
        return json(200, { ok: true });
      }
      if (method === 'POST' && path === '/api/track') {
        limit(`track:${req.socket.remoteAddress}`, 30);
        const b = await bodyOf(req), reference = text(b.reference, 'Reference', 30).toUpperCase(), code = text(b.code, 'Access code', 100);
        const p = db.prepare('SELECT * FROM projects WHERE reference=?').get(reference);
        requireThat(p && p.access_hash === digest(code), 401, 'Reference or access code is incorrect. Check your saved request receipt.');
        const csrf = newSession(res, null, p.id, s);
        return json(200, { csrf, projectId: p.id });
      }
      if (method === 'POST' && path === '/api/requests') {
        limit(`request:${req.socket.remoteAddress}`, 20);
        const b = await bodyOf(req), name = text(b.customer_name, 'Customer name', 100), address = email(b.email);
        const phone = text(b.phone, 'Phone number', 40);
        requireThat(/^[+()\d\s.\-]{7,40}$/.test(phone) && phone.replace(/\D/g, '').length >= 7, 400, 'Enter a phone number with at least 7 digits.');
        requireThat(SERVICES.includes(b.service), 400, 'Choose a service.');
        const requirements = text(b.requirements, 'Design requirements', 10000), attachment = b.file ? upload(b.file) : null;
        const code = secret();
        const p = transaction(db, () => {
          const time = now();
          const id = Number(db.prepare('INSERT INTO projects(customer_name,email,phone,service,requirements,original_requirements,access_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(name,address,phone,b.service,requirements,requirements,digest(code),time,time).lastInsertRowid);
          db.prepare('UPDATE projects SET reference=? WHERE id=?').run(`GG${1000+id}`, id);
          if (attachment) saveFile(id, attachment, 'reference');
          event(db, id, s?.user?.name || name, 'Design request submitted.');
          return db.prepare('SELECT id,reference FROM projects WHERE id=?').get(id);
        });
        const csrf = s?.user ? s.csrf : newSession(res, null, p.id, s);
        return json(201, { ...p, code, csrf });
      }
      if (method === 'GET' && path === '/api/projects') {
        staff(s);
        const rows = db.prepare(`SELECT p.id,p.reference,p.customer_name,p.service,p.status,p.due_date,p.created_at,p.updated_at,p.assigned_to,u.name assigned_name,
          (SELECT count(*) FROM revisions r WHERE r.project_id=p.id AND r.resolved_at IS NULL) pending_revisions
          FROM projects p LEFT JOIN users u ON p.assigned_to=u.id WHERE ?='owner' OR p.assigned_to=? ORDER BY p.updated_at DESC,p.id DESC`).all(s.user.role, s.user.id);
        return json(200, rows);
      }
      if (method === 'GET' && path === '/api/team') {
        owner(s); return json(200, db.prepare('SELECT id,name,email,role,active FROM users ORDER BY name').all());
      }
      if (method === 'POST' && path === '/api/team') {
        owner(s); const b = await bodyOf(req), name = text(b.name, 'Name', 100), address = email(b.email), password = text(b.password, 'Password', 256);
        requireThat(password.length >= 12, 400, 'Use a password of at least 12 characters.');
        requireThat(['owner', 'staff'].includes(b.role), 400, 'Choose a valid role.');
        const hash = await hashPassword(password);
        requireThat(!db.prepare('SELECT id FROM users WHERE email=?').get(address), 409, 'That email already has an account.');
        db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(name,address,hash,b.role,now());
        return json(201, { ok: true });
      }
      const teamMatch = path.match(/^\/api\/team\/(\d+)$/);
      if (method === 'PATCH' && teamMatch) {
        owner(s); const id = Number(teamMatch[1]), b = await bodyOf(req);
        requireThat(id !== s.user.id, 400, 'You cannot deactivate your own account.');
        requireThat(typeof b.active === 'boolean', 400, 'Choose an account state.');
        requireThat(db.prepare('SELECT id FROM users WHERE id=?').get(id), 404, 'Account not found.');
        db.prepare('UPDATE users SET active=? WHERE id=?').run(+b.active, id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
        return json(200, { ok: true });
      }
      if (method === 'POST' && path === '/api/password') {
        staff(s); limit(`password:${s.user.id}`, 10); const b = await bodyOf(req);
        const old = text(b.current, 'Current password', 256), next = text(b.password, 'New password', 256);
        requireThat(next.length >= 12, 400, 'Use a password of at least 12 characters.');
        const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(s.user.id);
        requireThat(await verifyPassword(old, user.password_hash), 400, 'Current password is incorrect.');
        const encoded = await hashPassword(next);
        db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded, s.user.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(s.user.id);
        return json(200, { csrf: newSession(res, s.user.id, null, null) });
      }
      const fileMatch = path.match(/^\/api\/files\/(\d+)$/);
      if (method === 'GET' && fileMatch) {
        const file = db.prepare('SELECT * FROM files WHERE id=?').get(Number(fileMatch[1]));
        requireThat(file, 404, 'File not found.'); getProject(file.project_id, s);
        const disposition = file.mime === 'application/pdf' || url.searchParams.has('download') ? 'attachment' : 'inline';
        res.writeHead(200, { 'Content-Type': file.mime, 'Content-Disposition': `${disposition}; filename="design-${file.id}"; filename*=UTF-8''${encodeURIComponent(file.name)}` });
        return res.end(Buffer.from(file.data));
      }
      const match = path.match(/^\/api\/projects\/(\d+)(?:\/(drafts|revisions|approve|status|assignment|notes|access-code|reopen))?$/);
      if (match) {
        const id = Number(match[1]), action = match[2];
        const p = getProject(id, s);
        if (method === 'GET' && !action) return json(200, detail(p, s));
        if (method === 'POST' && action) {
          const b = await bodyOf(req);
          // Re-read after receiving the body: another request may have committed meanwhile.
          const result = transaction(db, () => {
            const current = getProject(id, s); versionCheck(current, b);
            if (action === 'status') {
              staff(s);
              const allowed = { New: ['In Progress'], 'In Progress': [], 'Revision Requested': ['In Progress'], Review: [], Approved: ['Completed'], Completed: [] };
              requireThat(allowed[current.status].includes(b.status), 409, 'That status change is not allowed. Upload a draft for review; record customer approval before completion.');
              if (b.status === 'Completed') requireThat(current.approved_draft_id && current.approved_draft_id === current.latest_draft_id, 409, 'The latest draft needs customer approval.');
              db.prepare('UPDATE projects SET status=? WHERE id=?').run(b.status, id);
              event(db, id, actor(s), `Status changed from ${current.status} to ${b.status}.`);
            } else if (action === 'drafts') {
              staff(s); requireThat(['In Progress','Review','Revision Requested'].includes(current.status), 409, 'Start work before uploading a draft. Approved or completed work must be reopened by the owner.');
              const file = upload(b.file), note = text(b.note, 'Draft note', 2000, false);
              const version = db.prepare("SELECT count(*) n FROM files WHERE project_id=? AND kind='draft'").get(id).n + 1;
              const fileId = saveFile(id, file, 'draft', version, note);
              db.prepare("UPDATE projects SET latest_draft_id=?,approved_draft_id=NULL,status='Review' WHERE id=?").run(fileId, id);
              db.prepare('UPDATE revisions SET resolved_at=? WHERE project_id=? AND resolved_at IS NULL').run(now(),id);
              event(db,id,actor(s),`Draft ${version} uploaded for customer review.${note ? ' '+note : ''}`);
            } else if (action === 'revisions') {
              requireThat(s.project_id === id && !s.user, 403, 'Only the customer can request a revision.');
              requireThat(!['Approved','Completed'].includes(current.status), 409, 'This design is already approved. Contact the studio to reopen it.');
              const feedback = text(b.feedback, 'Revision details', 5000), after = text(b.requirements, 'Updated requirements', 10000, false) || current.requirements;
              db.prepare('INSERT INTO revisions(project_id,feedback,before_text,after_text,draft_id,created_at) VALUES(?,?,?,?,?,?)').run(id,feedback,current.requirements,after,current.latest_draft_id,now());
              db.prepare("UPDATE projects SET requirements=?,status='Revision Requested',approved_draft_id=NULL WHERE id=?").run(after,id);
              event(db,id,current.customer_name,'Revision requested: '+feedback);
            } else if (action === 'approve') {
              requireThat(s.project_id === id && !s.user, 403, 'Only the customer can approve a design.');
              requireThat(b.confirm === true, 400, 'Confirm that you approve this design for completion.');
              requireThat(current.status === 'Review' && current.latest_draft_id && b.draftId === current.latest_draft_id, 409, 'The latest design must be ready for review before approval. Refresh to check the latest draft.');
              const feedback = text(b.feedback, 'Feedback', 2000, false);
              db.prepare('INSERT INTO approvals(project_id,draft_id,customer_name,feedback,created_at) VALUES(?,?,?,?,?)').run(id,current.latest_draft_id,current.customer_name,feedback,now());
              db.prepare("UPDATE projects SET status='Approved',approved_draft_id=latest_draft_id WHERE id=?").run(id);
              event(db,id,current.customer_name,'Final design approved. '+feedback);
            } else if (action === 'assignment') {
              owner(s);
              const assigned = b.assigned_to == null ? null : b.assigned_to;
              requireThat(assigned === null || (Number.isInteger(assigned) && db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(assigned)),400,'Choose an active team member.');
              const due = text(b.due_date, 'Due date', 10, false) || null;
              requireThat(!due || (/^\d{4}-\d{2}-\d{2}$/.test(due) && !isNaN(Date.parse(due)) && new Date(due).toISOString().slice(0,10) === due),400,'Enter a valid due date.');
              db.prepare('UPDATE projects SET assigned_to=?,due_date=? WHERE id=?').run(assigned,due,id);
              event(db,id,actor(s),'Project assignment or due date updated.',true);
            } else if (action === 'notes') {
              staff(s); event(db,id,actor(s),text(b.note,'Staff note',5000),true);
            } else if (action === 'access-code') {
              owner(s); const code = secret();
              db.prepare('UPDATE projects SET access_hash=? WHERE id=?').run(digest(code),id);
              db.prepare('DELETE FROM sessions WHERE project_id=?').run(id);
              event(db,id,actor(s),'Customer access code replaced after identity verification.',true); touch(id);
              return { code, reference: current.reference };
            } else if (action === 'reopen') {
              owner(s); const reason = text(b.reason,'Reason for reopening',2000);
              requireThat(['Approved','Completed'].includes(current.status),409,'Only approved or completed projects can be reopened.');
              db.prepare("UPDATE projects SET status='In Progress',approved_draft_id=NULL WHERE id=?").run(id);
              event(db,id,actor(s),'Project reopened; a new customer approval is required. Reason: '+reason);
            }
            touch(id);
            return detail(db.prepare('SELECT * FROM projects WHERE id=?').get(id), s);
          });
          return json(200, result);
        }
      }
      throw new HttpError(404, 'Page or action not found.');
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      if (!error.status) console.error('Request failed:', error.message);
      json(error.status || 500, { error: error.status ? error.message : 'Something went wrong. Your change was not saved. Please try again.' });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return { server, db };
}
