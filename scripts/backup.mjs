import { backup } from 'node:sqlite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openDb } from '../src/db.mjs';
const folder=resolve(process.env.BACKUP_DIR || './backups');mkdirSync(folder,{recursive:true});
const db=openDb();
try{
  const target=resolve(folder,`gala-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
  await backup(db,target);
  console.log(`Backup saved: ${target}\nThis contains customer information and files. Store it privately and copy it off the server.`);
}finally{db.close();}
