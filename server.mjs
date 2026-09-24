import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {neon} from '@neondatabase/serverless';
import {seedEvents} from './seed.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const cloud=Boolean(process.env.DATABASE_URL),hosted=Boolean(process.env.VERCEL);
const dataDir=process.env.DATA_DIR||path.join(root,'data');
if(!cloud){fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(path.join(dataDir,'uploads'),{recursive:true});}
let db=null;
if(!cloud&&!hosted){const {DatabaseSync}=await import('node:sqlite');db=new DatabaseSync(path.join(dataDir,'risenrun.sqlite'));}
if(db)db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),profile_id TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,body TEXT NOT NULL);`);
const collections=['events','profiles','participants','submissions','settings','users'];
const cloudState=Object.fromEntries(collections.map(key=>[key,new Map()]));
const dirty=new Map();
let cloudSchemaReady=false;
const adminAttempts=new Map();
const siteSeed={name:'Rise & Run TT',tagline:'Encourage fitness & health anywhere.',email:'risenruntt@gmail.com',phone:'18683925275',instagram:'https://www.instagram.com/riserun.tt/',maxUploadMB:10};
async function ready(){
 if(cloud){
  const sql=neon(process.env.DATABASE_URL);
  if(!cloudSchemaReady){
   await sql.query('CREATE TABLE IF NOT EXISTS risenrun_schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
   await sql.query('CREATE TABLE IF NOT EXISTS risenrun_records (collection text NOT NULL, id text NOT NULL, body jsonb NOT NULL, PRIMARY KEY (collection, id))');
   await sql.query('CREATE TABLE IF NOT EXISTS risenrun_media (id text PRIMARY KEY, bytes bytea NOT NULL, content_type text NOT NULL)');
   await sql.query('CREATE TABLE IF NOT EXISTS risenrun_submission_claims (event_id text NOT NULL, profile_id text NOT NULL, email text NOT NULL, PRIMARY KEY (event_id, profile_id), UNIQUE (event_id, email))');
   await sql.query('INSERT INTO risenrun_schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING');
   cloudSchemaReady=true;
  }
  const rows=await sql.query('SELECT collection, id, body FROM risenrun_records');
  for(const collection of collections)cloudState[collection].clear();
  for(const row of rows)if(cloudState[row.collection])cloudState[row.collection].set(row.id,typeof row.body==='string'?JSON.parse(row.body):row.body);
  if(!cloudState.events.size)for(const e of seedEvents){cloudState.events.set(e.id,e);dirty.set(`events:${e.id}`,e);}
  if(!cloudState.settings.has('site')){const site={id:'site',...siteSeed};cloudState.settings.set('site',site);dirty.set('settings:site',site);}
  await flush();return;
 }
 if(!db)fail('The production database is not connected yet.',503);
 if(!db.prepare('SELECT COUNT(*) n FROM events').get().n)for(const e of seedEvents)db.prepare('INSERT INTO events VALUES (?,?)').run(e.id,JSON.stringify(e));
 if(!db.prepare('SELECT id FROM settings WHERE id=?').get('site'))db.prepare('INSERT INTO settings VALUES (?,?)').run('site',JSON.stringify({id:'site',...siteSeed}));
}
async function flush(){
 if(!cloud||!dirty.size)return;
 const sql=neon(process.env.DATABASE_URL),changes=[...dirty.entries()];
 for(const [key,value] of changes){const [collection,id]=key.split(':');if(value===null)await sql.query('DELETE FROM risenrun_records WHERE collection = $1 AND id = $2',[collection,id]);else await sql.query('INSERT INTO risenrun_records (collection,id,body) VALUES ($1,$2,$3::jsonb) ON CONFLICT (collection,id) DO UPDATE SET body=EXCLUDED.body',[collection,id,JSON.stringify(value)]);dirty.delete(key);}
}
const all=t=>cloud?[...cloudState[t].values()]:db.prepare(`SELECT body FROM ${t}`).all().map(x=>JSON.parse(x.body));
const get=(t,id)=>cloud?(cloudState[t].get(id)||null):(()=>{const r=db.prepare(`SELECT body FROM ${t} WHERE id=?`).get(id);return r?JSON.parse(r.body):null;})();
const save=(t,x)=>{
 if(cloud){cloudState[t].set(x.id,x);dirty.set(`${t}:${x.id}`,x);return x;}
 const body=JSON.stringify(x);
 if(t==='submissions')db.prepare('INSERT OR REPLACE INTO submissions VALUES (?,?,?,?)').run(x.id,x.eventId,x.profileId,body);
 else if(t==='participants')db.prepare('INSERT OR REPLACE INTO participants VALUES (?,?,?)').run(x.id,x.eventId,body);
 else db.prepare(`INSERT OR REPLACE INTO ${t} VALUES (?,?)`).run(x.id,body);
 return x;
};
const remove=(t,id)=>{if(cloud){cloudState[t].delete(id);dirty.set(`${t}:${id}`,null);}else db.prepare(`DELETE FROM ${t} WHERE id=?`).run(id);};
async function deleteEvent(id){
 const submissions=all('submissions').filter(x=>x.eventId===id),participants=all('participants').filter(x=>x.eventId===id);
 for(const submission of submissions)remove('submissions',submission.id);
 for(const participant of participants)remove('participants',participant.id);
 remove('events',id);
 if(cloud)await neon(process.env.DATABASE_URL).query('DELETE FROM risenrun_submission_claims WHERE event_id=$1',[id]);
 return {submissions:submissions.length,participants:participants.length};
}
async function reserveSubmission(eventId,profileId,email){
 if(!cloud)return true;
 const sql=neon(process.env.DATABASE_URL),result=await sql.query('INSERT INTO risenrun_submission_claims (event_id,profile_id,email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[eventId,profileId,email]);
 return result.length===1;
}
async function releaseSubmission(eventId,profileId,email){if(cloud)await neon(process.env.DATABASE_URL).query('DELETE FROM risenrun_submission_claims WHERE event_id=$1 AND (profile_id=$2 OR email=$3)',[eventId,profileId,email]);}
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const required=(value,label,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} is required (maximum ${max} characters).`);return value.trim();};
const dateValid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Port_of_Spain'}).format(new Date());
const uuid=()=>crypto.randomUUID();
const adminSignature=()=>process.env.ADMIN_PASSWORD?crypto.createHmac('sha256',process.env.ADMIN_PASSWORD).update('rise-run-admin').digest('hex'):'';
const sessionSecret=()=>process.env.AUTH_SECRET||(!hosted?'local-development-secret':'');
const hashPassword=async password=>{const salt=crypto.randomBytes(16).toString('hex'),derived=await promisify(crypto.scrypt)(password,salt,64);return `${salt}:${Buffer.from(derived).toString('hex')}`;};
const passwordMatches=async(password,stored)=>{const [salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;const derived=Buffer.from(await promisify(crypto.scrypt)(password,salt,64)),expected=Buffer.from(hash,'hex');return derived.length===expected.length&&crypto.timingSafeEqual(derived,expected);};
const sessionSignature=(id,role)=>sessionSecret()?crypto.createHmac('sha256',sessionSecret()).update(`${id}:${role}`).digest('hex'):'';
const sessionValue=(id,role)=>`${id}.${role}.${sessionSignature(id,role)}`;
const sessionFrom=(cookies)=>{const m=cookies.match(/(?:^|;\s*)rr_session=([a-f0-9-]+)\.(user|admin)\.([a-f0-9]+)(?:;|$)/);if(!m||!sessionSecret()||m[3]!==sessionSignature(m[1],m[2]))return null;return {id:m[1],role:m[2]};};
const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
const mailReady=()=>Boolean(process.env.RESEND_API_KEY&&process.env.MAIL_FROM);
async function sendAccountEmail(to,subject,html){if(!mailReady())return false;const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[to],subject,html})});if(!response.ok)throw new Error('The email provider could not deliver this message.');return true;}
const publicUser=user=>({id:user.id,name:user.name,displayName:user.displayName,email:user.email,createdAt:user.createdAt});
const sameHostOrigin=(origin,host)=>origin===`http://${host}`||origin===`https://${host}`;
const requestAddress=req=>(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').toString().split(',')[0].trim();
function allowAdminAttempt(req){const key=requestAddress(req),now=Date.now(),attempts=(adminAttempts.get(key)||[]).filter(t=>now-t<15*60*1000);if(attempts.length>=10)return false;attempts.push(now);adminAttempts.set(key,attempts);return true;}
const emailValid=s=>typeof s==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<255;
const publicResult=s=>({id:s.id,eventId:s.eventId,displayName:s.displayName,distance:s.distance,seconds:s.seconds,activityDate:s.activityDate,activity:s.activity,createdAt:s.reviewedAt});
const results=id=>all('submissions').filter(s=>s.status==='approved'&&(!id||s.eventId===id)).sort((a,b)=>a.seconds-b.seconds||String(a.reviewedAt||a.createdAt).localeCompare(String(b.reviewedAt||b.createdAt))||a.id.localeCompare(b.id)).map((s,i)=>({...publicResult(s),rank:i+1}));
const readableImage=(data)=>{
 if(typeof data!=='string')fail('Choose an image.');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
 if(!match)fail('Use a PNG, JPEG or WebP image.');
 const bytes=Buffer.from(match[2],'base64');
 const max=get('settings','site').maxUploadMB;
 if(bytes.length>max*1024*1024)fail(`Your image must be smaller than ${max} MB.`);
 const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)fail('The file contents do not match a supported image.');
 return {bytes,ext:match[1]==='jpeg'?'jpg':match[1]};
};
const imagePath=s=>typeof s==='string'&&/^\/(assets\/[\w.-]+|media\/[\w.-]+|api\/media\/[\w.-]+)$/.test(s);
async function storeMedia(id,image){
 if(cloud){const sql=neon(process.env.DATABASE_URL);await sql.query('INSERT INTO risenrun_media (id,bytes,content_type) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET bytes=EXCLUDED.bytes,content_type=EXCLUDED.content_type',[id,image.bytes,`image/${image.ext==='jpg'?'jpeg':image.ext}`]);return;}
 fs.writeFileSync(path.join(dataDir,'uploads',id),image.bytes);
}
async function sendMedia(res,id,privateFile=false){
 if(cloud){const sql=neon(process.env.DATABASE_URL),rows=await sql.query('SELECT bytes,content_type FROM risenrun_media WHERE id=$1',[id]);if(!rows.length)fail('File not found.',404);res.writeHead(200,{'Content-Type':rows[0].content_type,'Cache-Control':privateFile?'no-store':'public, max-age=3600'});res.end(Buffer.from(rows[0].bytes));return;}
 const match=/^(.+)\.(jpg|png|webp)$/.exec(id);if(!match)fail('File not found.',404);return file(res,path.join(dataDir,'uploads',id),privateFile);
}
function validateEvent(input,existing){
 const e={...existing,...input};
 e.name=required(e.name,'Event name',100);e.description=required(e.description,'Description',6000);
 e.id=existing?.id||(input.slug||e.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 if(!e.id||e.id.length>100)fail('Choose a valid event slug.');
 if(!existing&&get('events',e.id))fail('An event with this URL already exists.',409);
 if(!['draft','open','closed','completed'].includes(e.status))fail('Choose an event status.');
 for(const k of ['distance','minDistance','maxDistance']){e[k]=Number(e[k]);if(!Number.isFinite(e[k])||e[k]<=0||e[k]>1000)fail('Distance values must be between 0 and 1,000 km.');}
 if(e.minDistance>e.distance||e.maxDistance<e.distance)fail('The required distance must fall between minimum and maximum.');
 for(const k of ['startDate','endDate','deadline'])if(e[k]&&!dateValid(e[k]))fail('Use valid event dates.');
 if(e.startDate&&e.endDate&&e.startDate>e.endDate)fail('The event end must be after the start.');
 if(e.deadline&&e.endDate&&e.deadline<e.endDate)fail('The deadline must be on or after the event end.');
 if(!Array.isArray(e.activities)||!e.activities.length||e.activities.some(a=>!['Run','Walk','Cycle','Swim'].includes(a)))fail('Select at least one valid activity.');
 if(!Array.isArray(e.methods)||!e.methods.length||e.methods.some(m=>!['screenshot','strava'].includes(m)))fail('Select a submission method.');
 if(e.status!=='draft'&&(!imagePath(e.cover)||!imagePath(e.medal)))fail('Add cover and medal images before publishing.');
 e.gallery=Array.isArray(e.gallery)?e.gallery.filter(imagePath):[];
 e.pickupLocations=Array.isArray(e.pickupLocations)?e.pickupLocations.map(s=>String(s).slice(0,150)):[];
 for(const k of ['subtitle','series','location','collection','medalDescription'])e[k]=String(e[k]||'').slice(0,2000);
 for(const k of ['allowLate','allowResubmit','requireEnrollment'])e[k]=e[k]===true;
 e.homeFeatured=e.homeFeatured===true;
 e.homePosition=Number(e.homePosition);if(!Number.isInteger(e.homePosition)||e.homePosition<1||e.homePosition>99)e.homePosition=99;
 e.updatedAt=new Date().toISOString();return e;
}
function participant(input){
 const x={...input,id:input.id||uuid()};
 if(!get('events',x.eventId))fail('Select an event.');
 x.name=required(x.name,'Participant name',120);if(!emailValid(x.email))fail('Enter a valid participant email.');x.email=x.email.trim().toLowerCase();
 x.bib=String(x.bib||'').slice(0,40);x.country=String(x.country||'Trinidad & Tobago').slice(0,100);x.active=x.active!==false;
 if(all('participants').some(p=>p.id!==x.id&&p.eventId===x.eventId&&p.email===x.email))fail('This participant is already on the event roster.',409);
 return x;
}
async function body(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>30*1024*1024)fail('Request too large.',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail('Invalid request data.');}}
async function json(res,status,value){await flush();res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
function file(res,p,privateFile=false){if(!fs.existsSync(p)||!fs.statSync(p).isFile())fail('File not found.',404);const ext=path.extname(p);res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':privateFile||['.html','.js','.css'].includes(ext)?'no-store':'public, max-age=3600'});fs.createReadStream(p).pipe(res);}
export async function handler(req,res){
 try{
  const host=req.headers.host||'';
  if(!cloud&&!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))fail('Local access only.',403);
  if(req.headers.origin&&!sameHostOrigin(req.headers.origin,host))fail('Requests must originate from this website.',403);
  await ready();
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,'http://'+host),p=decodeURIComponent(url.pathname),method=req.method;
  const cookies=req.headers.cookie||'';
  const cookie=cookies.match(/(?:^|;\s*)rr_device=([a-f0-9-]{36})(?:;|$)/)?.[1];
  const device=cookie||uuid();const addCookie=value=>{const old=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',old?[].concat(old,value):value);};if(!cookie)addCookie(`rr_device=${device}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${cloud?'; Secure':''}`);
  const setSession=(id,role)=>addCookie(`rr_session=${sessionValue(id,role)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${cloud?'; Secure':''}`);
  let session=sessionFrom(cookies),user=session?.role==='user'?get('users',session.id):null;if(session?.role==='user'&&!user)session=null;
  if(p==='/api/auth/session'&&method==='GET')return json(res,200,{authenticated:Boolean(session),role:session?.role||null,user:user?publicUser(user):null});
  if(p==='/api/auth/signup'&&method==='POST'){
   if(!sessionSecret())fail('Account setup is not configured yet.',503);
   const x=await body(req),name=required(x.name,'Name',120),displayName=required(x.displayName,'Display name',80),email=required(x.email,'Email',254).toLowerCase(),password=required(x.password,'Password',200);
   if(!emailValid(email))fail('Enter a valid email.');if(password.length<8)fail('Choose a password with at least 8 characters.');if(all('users').some(existing=>existing.email===email)||email===String(process.env.ADMIN_EMAIL||'').toLowerCase())fail('An account already exists for this email.',409);
   const newUser={id:uuid(),name,displayName,email,passwordHash:await hashPassword(password),createdAt:new Date().toISOString()};save('users',newUser);save('profiles',{id:newUser.id,name,displayName,email,country:String(x.country||'Trinidad & Tobago').slice(0,100)});setSession(newUser.id,'user');return json(res,201,publicUser(newUser));
  }
  if(p==='/api/auth/login'&&method==='POST'){
   if(!sessionSecret())fail('Account setup is not configured yet.',503);
   const x=await body(req),email=required(x.email,'Email',254).toLowerCase(),password=required(x.password,'Password',200),adminEmail=String(process.env.ADMIN_EMAIL||'').toLowerCase();
   if(adminEmail&&email===adminEmail&&password===process.env.ADMIN_PASSWORD){const adminId='admin';setSession(adminId,'admin');addCookie(`rr_admin=${adminSignature()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; Secure`);return json(res,200,{role:'admin',email:adminEmail});}
   const found=all('users').find(candidate=>candidate.email===email);if(!found||!await passwordMatches(password,found.passwordHash))fail('Incorrect email or password.',401);setSession(found.id,'user');return json(res,200,{role:'user',user:publicUser(found)});
  }
  if(p==='/api/auth/password-reset/request'&&method==='POST'){
   const x=await body(req),email=required(x.email,'Email',254).toLowerCase(),found=all('users').find(candidate=>candidate.email===email);if(!found)return json(res,200,{ok:true});if(!mailReady())fail('Password-reset email delivery is not configured yet. Ask the organizer to add the mail service key.',503);
   const token=crypto.randomBytes(32).toString('hex');found.resetTokenHash=tokenHash(token);found.resetTokenExpires=Date.now()+3600000;save('users',found);const link=`${cloud?'https':'http'}://${host}/reset-password?token=${token}`;await sendAccountEmail(found.email,'Reset your Rise & Run TT password',`<p>Use this secure link within one hour to reset your password:</p><p><a href="${link}">Reset password</a></p>`);return json(res,200,{ok:true});
  }
  if(p==='/api/auth/password-reset/confirm'&&method==='POST'){
   const x=await body(req),token=required(x.token,'Reset token',200),password=required(x.password,'Password',200),found=all('users').find(candidate=>candidate.resetTokenHash===tokenHash(token)&&Number(candidate.resetTokenExpires)>Date.now());if(!found)fail('This password-reset link is invalid or has expired.',400);if(password.length<8)fail('Choose a password with at least 8 characters.');found.passwordHash=await hashPassword(password);delete found.resetTokenHash;delete found.resetTokenExpires;save('users',found);setSession(found.id,'user');return json(res,200,{ok:true});
  }
  if(p==='/api/auth/password/change'&&method==='POST'){
   if(!user)fail('Sign in to change your password.',401);const x=await body(req),current=required(x.currentPassword,'Current password',200),next=required(x.newPassword,'New password',200);if(!await passwordMatches(current,user.passwordHash))fail('Your current password is incorrect.',401);if(next.length<8)fail('Choose a password with at least 8 characters.');user.passwordHash=await hashPassword(next);save('users',user);return json(res,200,{ok:true});
  }
  if(p==='/api/auth/logout'&&method==='POST'){addCookie(`rr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cloud?'; Secure':''}`);addCookie(`rr_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cloud?'; Secure':''}`);return json(res,200,{ok:true});}
  if(cloud&&p.startsWith('/api/admin/')){
   if(!process.env.ADMIN_PASSWORD)fail('Admin access is not configured. Add ADMIN_PASSWORD in Vercel project settings.',503);
   const saved=cookies.match(/(?:^|;\s*)rr_admin=([a-f0-9]+)(?:;|$)/)?.[1],provided=req.headers['x-risenrun-admin'];
   if(session?.role==='admin'||provided===process.env.ADMIN_PASSWORD)addCookie(`rr_admin=${adminSignature()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; Secure`);
   else if(saved!==adminSignature()){if(!allowAdminAttempt(req))fail('Too many admin access attempts. Try again in 15 minutes.',429);fail('Admin access code required.',401);}
  }
  if(p==='/api/site'&&method==='GET')return json(res,200,get('settings','site'));
  if(p==='/api/events'&&method==='GET')return json(res,200,all('events').filter(e=>e.status!=='draft'));
  const profileId=user?.id||device;
  if(p==='/api/profile'&&method==='GET')return json(res,200,get('profiles',profileId)||{id:profileId,name:'',displayName:'',email:'',country:'Trinidad & Tobago'});
  if(p==='/api/profile'&&method==='PUT'){
   const x=await body(req);x.id=profileId;x.name=required(x.name,'Name',120);x.displayName=required(x.displayName,'Display name',80);if(!emailValid(x.email))fail('Enter a valid email.');x.email=x.email.toLowerCase();x.country=String(x.country||'').slice(0,100);return json(res,200,save('profiles',x));
  }
  if(p==='/api/me'&&method==='GET'){
   const profile=get('profiles',profileId);return json(res,200,{profile,submissions:all('submissions').filter(s=>s.profileId===profileId),participants:all('participants').filter(x=>profile&&x.email===profile.email)});
  }
  if(p==='/api/results'&&method==='GET')return json(res,200,results(url.searchParams.get('event')));
  if(p==='/api/submissions'&&method==='POST'){
   if(!user)fail('Create an account or sign in before submitting your run.',401);
   const x=await body(req),e=get('events',x.eventId);if(!e||e.status!=='open')fail('This event is not accepting submissions.');
   const now=today();if(e.startDate&&now<e.startDate)fail(`This event opens on ${e.startDate}.`);
   if(e.deadline&&now>e.deadline&&!e.allowLate)fail('The submission deadline has passed.');
   const displayName=required(x.displayName,'Display name',80);if(!emailValid(x.email))fail('Enter a valid email.');const email=x.email.trim().toLowerCase();
   const roster=all('participants').find(r=>r.eventId===e.id&&r.email===email&&r.active);
   if(e.requireEnrollment&&!roster)fail('Your email is not on this event’s participant list. Contact the organizer.');
   const previous=all('submissions').filter(s=>s.eventId===e.id&&(s.profileId===profileId||s.email===email));
   if(previous.some(s=>['pending','approved'].includes(s.status)))fail('A run is already awaiting review or approved for this event.',409);
   if(previous.length&&!e.allowResubmit)fail('Resubmissions are not enabled for this event.');
   const distance=Number(x.distance),seconds=Number(x.seconds);
   if(!Number.isFinite(distance)||distance<e.minDistance||distance>e.maxDistance)fail(`Distance must be ${e.minDistance}–${e.maxDistance} km.`);
   if(!Number.isInteger(seconds)||seconds<1||seconds>172800)fail('Enter a valid completion time.');
   if(!e.activities.includes(x.activity))fail('This activity type is not accepted.');
   if(!dateValid(x.activityDate)||x.activityDate>now)fail('Choose a valid activity date, no later than today.');
   if((e.startDate&&x.activityDate<e.startDate)||(e.endDate&&x.activityDate>e.endDate))fail('Your activity must be inside the event window.');
   if(!e.methods.includes(x.method))fail('This submission method is not accepted.');
   if(x.consent!==true)fail('Confirm that this is your activity and you agree to publish your display name and result.');
   let evidence='',stravaUrl='',fingerprint='',flags=[],upload=null;
   if(x.method==='strava'){
    let u;try{u=new URL(x.stravaUrl);}catch{fail('Enter a valid Strava activity URL.');}
    if(!['strava.com','www.strava.com'].includes(u.hostname)||u.protocol!=='https:'||!/^\/activities\/\d+\/?$/.test(u.pathname)||u.username||u.password)fail('Use https://www.strava.com/activities/ followed by an activity number.');
    stravaUrl='https://www.strava.com'+u.pathname.replace(/\/$/,'');
    if(all('submissions').some(s=>s.stravaUrl===stravaUrl&&s.status!=='rejected'))fail('This Strava activity has already been submitted.',409);
   }else{
    const im=readableImage(x.image);upload=im;fingerprint=crypto.createHash('sha256').update(im.bytes).digest('hex');
    if(all('submissions').some(s=>s.fingerprint===fingerprint))flags.push('Screenshot previously submitted');
   }
   if(!await reserveSubmission(e.id,profileId,email))fail('A run is already awaiting review or approved for this event.',409);
   if(upload){evidence=cloud?uuid():uuid()+'.'+upload.ext;await storeMedia(evidence,upload);}
   if(seconds/distance<150||seconds/distance>1800)flags.push('Unusual pace — check activity details');
   const s={id:uuid(),eventId:e.id,profileId:profileId,displayName,email,bib:roster?.bib||'',distance,seconds,activity:x.activity,activityDate:x.activityDate,method:x.method,stravaUrl,evidence,fingerprint,notes:String(x.notes||'').slice(0,2000),status:'pending',flags,reason:'',createdAt:new Date().toISOString()};
   try{save('profiles',{...(get('profiles',profileId)||{}),id:profileId,name:x.name||displayName,displayName,email,country:x.country||'Trinidad & Tobago'});return await json(res,201,save('submissions',s));}catch(error){await releaseSubmission(e.id,profileId,email);throw error;}
  }
  if(p.startsWith('/api/submissions/')&&method==='GET'){
   const s=get('submissions',p.split('/').pop());if(!s||s.profileId!==profileId)fail('Submission not found on this account.',404);return json(res,200,s);
  }
  // Local management intentionally has no login, as requested. The server binds to loopback only.
  if(p==='/api/admin/state'&&method==='GET')return json(res,200,{events:all('events'),participants:all('participants'),submissions:all('submissions'),users:all('users').map(publicUser),settings:get('settings','site')});
  if(p==='/api/admin/events'&&method==='POST')return json(res,201,save('events',validateEvent(await body(req))));
  if(/^\/api\/admin\/events\/[^/]+$/.test(p)){
   const id=p.split('/').pop(),e=get('events',id);if(!e)fail('Event not found.',404);
   if(method==='PUT')return json(res,200,save('events',validateEvent(await body(req),e)));
   if(method==='DELETE'){const removed=await deleteEvent(id);return json(res,200,{ok:true,...removed});}
  }
  if(p==='/api/admin/media'&&method==='POST'){
   const im=readableImage((await body(req)).image),base='public-'+uuid(),name=cloud?base:base+'.'+im.ext;await storeMedia(name,im);return json(res,201,{url:cloud?'/api/media/'+name:'/media/'+name});
  }
  if(/^\/api\/media\/public-[a-f0-9-]+$/.test(p)&&method==='GET')return sendMedia(res,p.split('/').pop());
  if(/^\/media\/public-[a-f0-9-]+\.(jpg|png|webp)$/.test(p))return file(res,path.join(dataDir,'uploads',path.basename(p)));
  if(/^\/api\/admin\/evidence\/[^/]+$/.test(p)&&method==='GET'){
   const s=get('submissions',p.split('/').pop());if(!s?.evidence)fail('No screenshot for this submission.',404);return sendMedia(res,s.evidence,true);
  }
  if(/^\/api\/admin\/submissions\/[^/]+$/.test(p)&&method==='PATCH'){
   const s=get('submissions',p.split('/').pop()),x=await body(req);if(!s)fail('Submission not found.',404);
   if(!['approved','rejected','pending'].includes(x.status))fail('Select a review decision.');
   if(x.status==='rejected')x.reason=required(x.reason,'Rejection reason',1000);
   if(x.seconds!==undefined){const n=Number(x.seconds);if(!Number.isInteger(n)||n<1||n>172800)fail('Enter a valid time.');s.seconds=n;}
   if(x.distance!==undefined){const n=Number(x.distance),e=get('events',s.eventId);if(!Number.isFinite(n)||n<e.minDistance||n>e.maxDistance)fail('Distance is outside the event limits.');s.distance=n;}
   s.status=x.status;s.reason=x.status==='rejected'?x.reason:'';s.reviewedAt=new Date().toISOString();if(x.status==='rejected')await releaseSubmission(s.eventId,s.profileId,s.email);return json(res,200,save('submissions',s));
  }
  if(p==='/api/admin/participants'&&method==='POST')return json(res,201,save('participants',participant(await body(req))));
  if(/^\/api\/admin\/participants\/[^/]+$/.test(p)&&method==='PUT'){
   const id=p.split('/').pop(),old=get('participants',id);if(!old)fail('Participant not found.',404);return json(res,200,save('participants',participant({...old,...await body(req),id})));
  }
  if(p==='/api/admin/import'&&method==='POST'){
   const input=await body(req);if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>2000)fail('Upload between 1 and 2,000 participants.');
   const seen=new Set();const rows=input.rows.map((x,i)=>{try{const r=participant(x),key=r.eventId+':'+r.email;if(seen.has(key))fail('Duplicate participant in CSV.');seen.add(key);return r;}catch(e){fail(`Row ${i+2}: ${e.message}`);}});
   if(cloud){rows.forEach(r=>save('participants',r));return json(res,201,{count:rows.length});}
   db.exec('BEGIN');try{rows.forEach(r=>save('participants',r));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,201,{count:rows.length});
  }
  if(p==='/api/admin/settings'&&method==='PUT'){
   const x=await body(req);x.id='site';x.name=required(x.name,'Organization name',100);if(!emailValid(x.email))fail('Enter a valid contact email.');
   x.maxUploadMB=Number(x.maxUploadMB);if(!Number.isFinite(x.maxUploadMB)||x.maxUploadMB<1||x.maxUploadMB>20)fail('Upload limit must be 1–20 MB.');
   for(const k of ['tagline','phone','instagram','homeEditorialHeading','homeEditorialCopy','homeStoryHeading','homeStoryCopy'])x[k]=String(x[k]||'').slice(0,2000);
   for(const k of ['homeEditorialImage','homeStoryImage']){x[k]=String(x[k]||'');if(x[k]&&!imagePath(x[k]))fail('Use an uploaded image for home-page artwork.');}
   if(!/^https:\/\/www\.instagram\.com\/[\w.]+\/?$/.test(x.instagram))fail('Use a valid Instagram profile URL.');return json(res,200,save('settings',x));
  }
  if(p.startsWith('/api/'))fail('This action was not found.',404);
  if(cloud&&p==='/admin'&&session?.role!=='admin'){res.writeHead(302,{Location:'/login?role=admin'});res.end();return;}
  if(cloud&&/^\/events\/[^/]+\/submit$/.test(p)&&!user){res.writeHead(302,{Location:'/signup'});res.end();return;}
  if(p.startsWith('/assets/')||['/app.js','/styles.css','/experience.js','/experience.css','/completion.js','/auth.js','/auth.css','/account-nav.js','/recovery.js','/share-tools.js'].includes(p)){
   const target=path.resolve(root,'public','.'+p);if(!target.startsWith(path.join(root,'public')+path.sep))fail('Not found.',404);return file(res,target);
  }
  if(method!=='GET')fail('Method not allowed.',405);
  if(p==='/login'||p==='/signup')return file(res,path.join(root,'public','auth.html'),true);
  if(p==='/forgot-password'||p==='/reset-password'||p==='/account/security')return file(res,path.join(root,'public','recovery.html'),true);
  if(p==='/'||p==='/RISENRUNTT_website.html'||/^\/(events|results|my-runs|profile|how-it-works|about|faq|admin)(\/[^.]*)?$/.test(p))return file(res,path.join(root,'public','index.html'),true);
  fail('Page not found.',404);
 }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});else res.end();if(!e.status)console.error(e);}
}
export default handler;
if(!process.env.VERCEL){const server=http.createServer(handler);server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Rise & Run TT: http://localhost:${process.env.PORT||4173} — local storage ready`));}
