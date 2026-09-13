import { openDb, now } from '../src/db.mjs';
import { hashPassword, email, text } from '../src/security.mjs';
import { emitKeypressEvents } from 'node:readline';
const args = process.argv.slice(2);
function flag(key, fallback) { const i=args.indexOf('--'+key); return i<0?fallback:args[i+1]; }
async function passwordPrompt() {
  if (process.env.GALA_USER_PASSWORD) return process.env.GALA_USER_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('Run in a terminal or provide GALA_USER_PASSWORD in the environment.');
  process.stdout.write('Password (at least 12 characters; typing is hidden): ');
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise(resolve=>{
    let value='';
    function handle(character,key) {
      if(key?.ctrl&&key.name==='c'){process.stdin.setRawMode(false);process.exit(1);}
      if(key?.name==='return'){process.stdin.off('keypress',handle);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);}
      else if(key?.name==='backspace')value=value.slice(0,-1);
      else if(character&&!key?.ctrl&&!key?.meta)value+=character;
    }
    process.stdin.on('keypress',handle);
  });
}
try {
  const address=email(flag('email','')), reset=args.includes('--reset');
  const name=reset?'':text(flag('name',''),'Name',100), role=flag('role','owner');
  if(!['owner','staff'].includes(role))throw new Error('Role must be owner or staff.');
  const password=await passwordPrompt();
  if(password.length<12||password.length>256)throw new Error('Use a password between 12 and 256 characters.');
  const hash=await hashPassword(password), db=openDb();
  try{
    const existing=db.prepare('SELECT id FROM users WHERE email=?').get(address);
    if(reset){
      if(!existing)throw new Error('Account not found.');
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,existing.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
      console.log('Password updated. Existing sessions signed out.');
    }else{
      if(existing)throw new Error('Account already exists. Use --reset to replace its password.');
      db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(name,address,hash,role,now());
      console.log(`Created ${role} account: ${address}`);
    }
  }finally{db.close();}
}catch(error){console.error(error.message);console.error('Example: npm run user -- --email you@example.com --name "Studio Owner" --role owner');process.exitCode=1;}
