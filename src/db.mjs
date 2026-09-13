import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function openDb(dir = process.env.DATA_DIR || './data') {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(resolve(dir, 'gala.sqlite'), { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','staff')),
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(
      id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE,
      customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
      service TEXT NOT NULL, requirements TEXT NOT NULL, original_requirements TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','In Progress','Review','Revision Requested','Approved','Completed')),
      access_hash TEXT NOT NULL, assigned_to INTEGER REFERENCES users(id), due_date TEXT,
      version INTEGER NOT NULL DEFAULT 1, latest_draft_id INTEGER, approved_draft_id INTEGER,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files(
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, kind TEXT NOT NULL,
      version INTEGER, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions(
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      feedback TEXT NOT NULL, before_text TEXT NOT NULL, after_text TEXT NOT NULL,
      draft_id INTEGER REFERENCES files(id), resolved_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals(
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      draft_id INTEGER NOT NULL REFERENCES files(id), customer_name TEXT NOT NULL,
      feedback TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      actor TEXT NOT NULL, message TEXT NOT NULL, private INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(
      token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id),
      project_id INTEGER REFERENCES projects(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS events_project ON events(project_id);
    CREATE INDEX IF NOT EXISTS revisions_project ON revisions(project_id);
    CREATE INDEX IF NOT EXISTS files_project ON files(project_id);
    CREATE INDEX IF NOT EXISTS projects_assignment ON projects(assigned_to);
    INSERT OR IGNORE INTO settings VALUES('schema_version','1');`);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export const now = () => new Date().toISOString();
export function event(db, projectId, actor, message, isPrivate = false) {
  db.prepare('INSERT INTO events(project_id,actor,message,private,created_at) VALUES(?,?,?,?,?)').run(projectId, actor, message, +isPrivate, now());
}
