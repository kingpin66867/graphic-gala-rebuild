import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { backup, DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.mjs';
import { hashPassword } from '../src/security.mjs';
import { now } from '../src/db.mjs';
const origin='http://localhost:3000';
const fixture = { customer_name:'Test Customer', email:'customer@example.test', phone:'+592 600 1234', service:'Packaging', requirements:'Cream packaging with green lettering.' };
const png = readFileSync(new URL('../scripts/demo-design.png',import.meta.url)).toString('base64');
async function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'gala-test-')), app=createApp({dataDir:dir,origin,production:false});
  const hash=await hashPassword('TestPassword!123');
  for(const [name,email,role] of [['Owner','owner@example.test','owner'],['Designer','designer@example.test','staff'],['Other Staff','other@example.test','staff']]) app.db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(name,email,hash,role,now());
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base=`http://127.0.0.1:${app.server.address().port}`;
  let stopped=false;
  async function stop(){if(stopped)return;await new Promise(resolve=>app.server.close(resolve));app.db.close();stopped=true;}
  t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
  function client() {
    let cookie='', csrf='';
    return async(path,body,expected=200,extra={},method='POST')=>{
      const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':method,headers:{Cookie:cookie,Origin:origin,'X-Gala-Request':'1','Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      const type=response.headers.get('content-type');
      const data=type?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer());
      assert.equal(response.status,expected,`${path}: ${JSON.stringify(data).slice(0,200)}`);
      if(data.csrf)csrf=data.csrf;
      return data;
    };
  }
  return { ...app,dir,base,client,stop };
}
async function login(client,email='owner@example.test') { await client('/login',{email,password:'TestPassword!123'}); }

test('TC-01/02: mandatory validation, unique references, durable request + file, no hash exposure',async t=>{
  const {client,db}=await setup(t), customer=client();
  await customer('/requests',{...fixture,phone:''},400);
  await customer('/requests',{...fixture,service:'Accounting'},400);
  await customer('/requests',{...fixture,email:'invalid'},400);
  assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,0);
  const a=await customer('/requests',{...fixture,file:{name:'inspiration.png',data:png}},201);
  const p=await customer('/projects/'+a.id);
  assert.equal(a.reference,'GG1001');assert.equal(p.files.length,1);assert.equal(p.access_hash,undefined);
  assert.notEqual(db.prepare('SELECT access_hash FROM projects WHERE id=?').get(a.id).access_hash,a.code);
  const b=await customer('/requests',fixture,201);assert.notEqual(a.reference,b.reference);
  await customer('/projects/'+a.id,undefined,404);
  await customer('/track',{reference:a.reference.toLowerCase(),code:a.code});
  assert.equal((await customer('/projects/'+a.id)).requirements,fixture.requirements);
  const file=await customer('/files/'+p.files[0].id);assert.equal(file.length,Buffer.from(png,'base64').length);
});

test('TC-03 to TC-10: full request, assignment, draft, revision, approval, completion, retained history',async t=>{
  const {client}=await setup(t), customer=client(), owner=client(), designer=client();
  const request=await customer('/requests',fixture,201);await login(owner);await login(designer,'designer@example.test');
  let p=await owner('/projects/'+request.id);
  assert.equal((await owner('/projects')).length,1);assert.equal((await designer('/projects')).length,0);
  p=await owner(`/projects/${p.id}/assignment`,{version:p.version,assigned_to:2,due_date:'2026-12-01'});
  assert.equal((await designer('/projects')).length,1);
  await designer(`/projects/${p.id}/status`,{version:p.version,status:'Completed'},409);
  p=await designer(`/projects/${p.id}/status`,{version:p.version,status:'In Progress'});
  p=await designer(`/projects/${p.id}/drafts`,{version:p.version,file:{name:'draft.png',data:png},note:'First draft'});
  const draftId=p.latest_draft_id;assert.equal(p.status,'Review');
  await customer(`/projects/${p.id}/approve`,{version:p.version,draftId,confirm:false},400);
  p=await customer(`/projects/${p.id}/revisions`,{version:p.version,feedback:'Make the name larger.',requirements:'Larger green lettering.'});
  assert.equal(p.status,'Revision Requested');assert.equal(p.revisions[0].before_text,fixture.requirements);
  assert.equal(p.revisions[0].after_text,'Larger green lettering.');
  await customer(`/projects/${p.id}/approve`,{version:p.version,draftId,confirm:true},409);
  p=await designer(`/projects/${p.id}/drafts`,{version:p.version,file:{name:'draft-v2.png',data:png}});
  assert.ok(p.revisions[0].resolved_at);assert.equal(p.files[0].version,2);
  await customer(`/projects/${p.id}/approve`,{version:p.version,draftId,confirm:true},409);
  await designer(`/projects/${p.id}/approve`,{version:p.version,draftId:p.latest_draft_id,confirm:true},403);
  p=await customer(`/projects/${p.id}/approve`,{version:p.version,draftId:p.latest_draft_id,confirm:true,feedback:'Approved.'});
  assert.equal(p.status,'Approved');assert.equal(p.approvals.length,1);
  await customer(`/projects/${p.id}/revisions`,{version:p.version,feedback:'Too late'},409);
  p=await designer(`/projects/${p.id}/status`,{version:p.version,status:'Completed'});
  assert.equal(p.status,'Completed');assert.equal(p.revisions.length,1);assert.equal(p.files.length,2);
  await designer(`/projects/${p.id}/drafts`,{version:p.version,file:{name:'late.png',data:png}},409);
  p=await owner(`/projects/${p.id}/reopen`,{version:p.version,reason:'Customer requested another change.'});
  assert.equal(p.status,'In Progress');assert.equal(p.approved_draft_id,null);assert.equal(p.approvals.length,1);
  await designer(`/projects/${p.id}/status`,{version:p.version,status:'Completed'},409);
});

test('Security: access boundaries, hidden staff notes, protected files, CSRF and role escalation',async t=>{
  const {client}=await setup(t), customer=client(), outsider=client(), owner=client(), staff=client();
  const r=await customer('/requests',{...fixture,file:{name:'private.png',data:png}},201);
  await outsider('/projects',undefined,403);await outsider('/projects/'+r.id,undefined,401);
  await outsider('/track',{reference:r.reference,code:'wrong'},401);
  await outsider('/login',{email:'owner@example.test',password:'wrong'},401);
  await login(owner);await login(staff,'designer@example.test');
  await staff('/projects/'+r.id,undefined,404);await staff('/team',undefined,403);
  let p=await owner('/projects/'+r.id);
  await outsider('/files/'+p.files[0].id,undefined,401);await staff('/files/'+p.files[0].id,undefined,404);
  await owner(`/projects/${p.id}/notes`,{version:p.version,note:'secret staff note'},403,{'X-CSRF-Token':'bad'});
  await owner(`/projects/${p.id}/notes`,{version:p.version,note:'secret staff note'},403,{Origin:'https://attacker.example'});
  p=await owner(`/projects/${p.id}/notes`,{version:p.version,note:'secret staff note'});
  assert.ok(p.events.some(x=>x.message==='secret staff note'));
  const publicView=await customer('/projects/'+r.id);assert.ok(!publicView.events.some(x=>x.message==='secret staff note'));
  await customer(`/projects/${p.id}/assignment`,{version:p.version,assigned_to:2},403);
  await customer(`/projects/${p.id}/status`,{version:p.version,status:'In Progress'},403);
  const reset=await owner(`/projects/${p.id}/access-code`,{version:p.version});
  await customer('/projects/'+p.id,undefined,401);
  await customer('/track',{reference:r.reference,code:r.code},401);
  await customer('/track',{reference:r.reference,code:reset.code});
  assert.equal((await customer('/projects/'+p.id)).reference,r.reference);
});

test('Data integrity: stale edits, invalid dates, invalid uploads leave no partial records',async t=>{
  const {client,db}=await setup(t), customer=client(), owner=client();
  await customer('/requests',{...fixture,file:{name:'evil.html',data:Buffer.from('<script>bad</script>').toString('base64')}},400);
  assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,0);
  const r=await customer('/requests',fixture,201);await login(owner);
  let p=await owner('/projects/'+r.id);const version=p.version;
  await owner(`/projects/${p.id}/assignment`,{version,assigned_to:9999},400);
  await owner(`/projects/${p.id}/assignment`,{version,assigned_to:null,due_date:'2026-02-31'},400);
  p=await owner(`/projects/${p.id}/status`,{version,status:'In Progress'});
  await owner(`/projects/${p.id}/notes`,{version,note:'stale write'},409);
  await owner(`/projects/${p.id}/drafts`,{version:p.version,file:{name:'x.svg',data:Buffer.from('<svg/>').toString('base64')}},400);
  assert.equal(db.prepare('SELECT count(*) n FROM files').get().n,0);
  assert.equal((await owner('/projects/'+p.id)).status,'In Progress');
  assert.ok(!(await owner('/projects/'+p.id)).events.some(ev=>ev.message==='stale write'));
});

test('Account management: create, deactivate, self-protection, password rotation and session revocation',async t=>{
  const {client}=await setup(t), owner=client(), staff=client(), otherSession=client();
  await login(owner);await login(staff,'designer@example.test');await login(otherSession,'designer@example.test');
  await owner('/team',{name:'New staff',email:'new@example.test',password:'short',role:'staff'},400);
  await owner('/team',{name:'New staff',email:'new@example.test',password:'NewPassword!2026',role:'staff'},201);
  await owner('/team',{name:'Duplicate',email:'new@example.test',password:'NewPassword!2026',role:'staff'},409);
  await owner('/team/1',{active:false},400,{},'PATCH');
  await staff('/password',{current:'TestPassword!123',password:'ChangedPassword!123'});
  await otherSession('/projects',undefined,403);
  await owner('/team/2',{active:false},200,{},'PATCH');
  await staff('/projects',undefined,403);
  await staff('/login',{email:'designer@example.test',password:'ChangedPassword!123'},401);
});

test('Hardening: login throttling, security headers, health and static routes',async t=>{
  const {client,base}=await setup(t), c=client();
  for(let i=0;i<10;i++)await c('/login',{email:'nobody@example.test',password:'incorrect'},401);
  await c('/login',{email:'nobody@example.test',password:'incorrect'},429);
  const page=await fetch(base);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(await page.text(),/Graphic Gala/);
  assert.equal((await fetch(base+'/healthz')).status,200);
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal((await fetch(base+'/src/db.mjs')).status,404);
});

test('Persistence: data survives server restart; demo data cannot run in production',async t=>{
  const {client,db,dir,stop}=await setup(t), c=client();const r=await c('/requests',{...fixture,file:{name:'persistent.png',data:png}},201);
  const backupPath=join(dir,'backup.sqlite');
  await backup(db,backupPath);
  const restored=new DatabaseSync(backupPath);
  assert.equal(restored.prepare('SELECT reference FROM projects WHERE id=?').get(r.id).reference,r.reference);
  assert.equal(restored.prepare('SELECT length(data) size FROM files').get().size,Buffer.from(png,'base64').length);restored.close();
  await stop();
  const second=createApp({dataDir:dir,origin,production:false});
  assert.equal(second.db.prepare('SELECT reference FROM projects WHERE id=?').get(r.id).reference,r.reference);
  second.db.prepare("INSERT INTO settings VALUES('demo','true')").run();second.db.close();
  assert.throws(()=>createApp({dataDir:dir,origin,production:true}),/HTTPS/);
  assert.throws(()=>createApp({dataDir:dir,origin:'https://example.com',production:true}),/clean database/);
});
