import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, now, event, transaction } from '../src/db.mjs';
import { hashPassword, digest } from '../src/security.mjs';
const dir=resolve('data/demo');mkdirSync(dir,{recursive:true});
const db=openDb(dir);
if(db.prepare('SELECT count(*) n FROM projects').get().n===0 && db.prepare('SELECT count(*) n FROM users').get().n===0){
  const encoded=await hashPassword('GalaDemo!2026');
  transaction(db,()=>{
    db.prepare("INSERT OR REPLACE INTO settings VALUES('demo','true')").run();
    for(const [name,email,role] of [['Studio Owner','owner@graphicgala.test','owner'],['Alex Morgan','designer@graphicgala.test','staff']]) db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(name,email,encoded,role,now());
    const rows=[['Maya Rivers','Packaging','New'],['Olive & Co.','Logo Design','New'],['Northline Studio','Digital graphics','In Progress'],['Sunday Market','Print collateral','In Progress'],['Bloom & Gather','Packaging','Review'],['Cedar House','Logo Design','Revision Requested'],['Daylight Collective','Digital graphics','Approved'],['Paper & Petal','Print collateral','Completed']];
    rows.forEach(([name,service,status],i)=>{
      const created=new Date(Date.now()-(8-i)*86400_000).toISOString(), due=new Date(Date.now()+(i+3)*86400_000).toISOString().slice(0,10);
      const requirements=`Create ${service.toLowerCase()} for ${name}. A warm, natural palette with olive green and cream. Keep the typography clear and the layout simple. Include the business name and a welcoming message.`;
      const id=Number(db.prepare('INSERT INTO projects(reference,customer_name,email,phone,service,requirements,original_requirements,status,access_hash,assigned_to,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('GG'+(1001+i),name,`customer${i+1}@example.test`,'+592 600 0100',service,requirements,requirements,status,digest('GalaCustomerDemo2026'),2,due,created,created).lastInsertRowid);
      event(db,id,name,'Design request submitted.');
      if(['Review','Revision Requested','Approved','Completed'].includes(status)){
        const png=readFileSync(fileURLToPath(new URL('./demo-design.png',import.meta.url)));
        const fileId=Number(db.prepare("INSERT INTO files(project_id,name,mime,data,kind,version,note,created_at) VALUES(?,?,?,?, 'draft',1,?,?)").run(id,'sample-studio-design.png','image/png',png,'Fictional sample design for testing the review workflow.',created).lastInsertRowid);
        db.prepare('UPDATE projects SET latest_draft_id=? WHERE id=?').run(fileId,id);
        event(db,id,'Alex Morgan','Draft 1 uploaded for customer review.');
        if(status==='Revision Requested'){
          const after=requirements+' Please use a larger business name and a darker green.';
          db.prepare('INSERT INTO revisions(project_id,feedback,before_text,after_text,draft_id,created_at) VALUES(?,?,?,?,?,?)').run(id,'Please make the name larger and try a darker green.',requirements,after,fileId,now());
          db.prepare('UPDATE projects SET requirements=? WHERE id=?').run(after,id);
          event(db,id,name,'Revision requested: Larger name and darker green.');
        }
        if(['Approved','Completed'].includes(status)){
          db.prepare('UPDATE projects SET approved_draft_id=? WHERE id=?').run(fileId,id);
          db.prepare('INSERT INTO approvals(project_id,draft_id,customer_name,feedback,created_at) VALUES(?,?,?,?,?)').run(id,fileId,name,'Looks great. Approved!',now());
          event(db,id,name,'Final design approved.');
          if(status==='Completed')event(db,id,'Alex Morgan','Project completed.');
        }
      }
    });
  });
}
if(db.prepare("SELECT value FROM settings WHERE key='demo'").get()?.value!=='true')throw new Error('Refusing to run a non-demo database as a demo.');
db.close();
console.log('\nGraphic Gala local demo\nOpen http://localhost:3000\nOwner: owner@graphicgala.test\nStaff: designer@graphicgala.test\nPassword for both: GalaDemo!2026\nCustomer: GG1005 / GalaCustomerDemo2026\nDemo data is stored separately in data/demo.\n');
Object.assign(process.env,{DATA_DIR:dir,NODE_ENV:'development',HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'http://localhost:3000'});
await import('../server.mjs');
