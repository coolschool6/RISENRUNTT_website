import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {seedEvents} from './seed.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.DATA_DIR||path.join(root,'data');
fs.mkdirSync(dataDir,{recursive:true});
fs.mkdirSync(path.join(dataDir,'uploads'),{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'risenrun.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),profile_id TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,body TEXT NOT NULL);`);
if(!db.prepare('SELECT COUNT(*) n FROM events').get().n) for(const e of seedEvents) db.prepare('INSERT INTO events VALUES (?,?)').run(e.id,JSON.stringify(e));
if(!db.prepare('SELECT id FROM settings WHERE id=?').get('site')) db.prepare('INSERT INTO settings VALUES (?,?)').run('site',JSON.stringify({name:'Rise & Run TT',tagline:'Encourage fitness & health anywhere.',email:'risenruntt@gmail.com',phone:'18683925275',instagram:'https://www.instagram.com/riserun.tt/',maxUploadMB:10}));
const all=t=>db.prepare(`SELECT body FROM ${t}`).all().map(x=>JSON.parse(x.body));
const get=(t,id)=>{const r=db.prepare(`SELECT body FROM ${t} WHERE id=?`).get(id);return r?JSON.parse(r.body):null;};
const save=(t,x)=>{
 const body=JSON.stringify(x);
 if(t==='submissions')db.prepare('INSERT OR REPLACE INTO submissions VALUES (?,?,?,?)').run(x.id,x.eventId,x.profileId,body);
 else if(t==='participants')db.prepare('INSERT OR REPLACE INTO participants VALUES (?,?,?)').run(x.id,x.eventId,body);
 else db.prepare(`INSERT OR REPLACE INTO ${t} VALUES (?,?)`).run(x.id,body);
 return x;
};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const required=(value,label,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} is required (maximum ${max} characters).`);return value.trim();};
const dateValid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Port_of_Spain'}).format(new Date());
const uuid=()=>crypto.randomUUID();
const emailValid=s=>typeof s==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<255;
const publicResult=s=>({id:s.id,eventId:s.eventId,displayName:s.displayName,distance:s.distance,seconds:s.seconds,activityDate:s.activityDate,activity:s.activity,createdAt:s.reviewedAt});
const results=id=>all('submissions').filter(s=>s.status==='approved'&&(!id||s.eventId===id)).sort((a,b)=>a.seconds-b.seconds).map((s,i)=>({...publicResult(s),rank:i+1}));
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
const imagePath=s=>typeof s==='string'&&/^\/(assets\/[\w.-]+|media\/[\w.-]+)$/.test(s);
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
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
function file(res,p,privateFile=false){if(!fs.existsSync(p)||!fs.statSync(p).isFile())fail('File not found.',404);const ext=path.extname(p);res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':privateFile||['.html','.js','.css'].includes(ext)?'no-store':'public, max-age=3600'});fs.createReadStream(p).pipe(res);}
const server=http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))fail('Local access only.',403);
  if(req.headers.origin&&!['http://'+host].includes(req.headers.origin))fail('Requests must originate from this website.',403);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,'http://'+host),p=decodeURIComponent(url.pathname),method=req.method;
  const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)rr_device=([a-f0-9-]{36})(?:;|$)/)?.[1];
  const device=cookie||uuid();if(!cookie)res.setHeader('Set-Cookie',`rr_device=${device}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
  if(p==='/api/site'&&method==='GET')return json(res,200,get('settings','site'));
  if(p==='/api/events'&&method==='GET')return json(res,200,all('events').filter(e=>e.status!=='draft'));
  if(p==='/api/profile'&&method==='GET')return json(res,200,get('profiles',device)||{id:device,name:'',displayName:'',email:'',country:'Trinidad & Tobago'});
  if(p==='/api/profile'&&method==='PUT'){
   const x=await body(req);x.id=device;x.name=required(x.name,'Name',120);x.displayName=required(x.displayName,'Display name',80);if(!emailValid(x.email))fail('Enter a valid email.');x.email=x.email.toLowerCase();x.country=String(x.country||'').slice(0,100);return json(res,200,save('profiles',x));
  }
  if(p==='/api/me'&&method==='GET'){
   const profile=get('profiles',device);return json(res,200,{profile,submissions:all('submissions').filter(s=>s.profileId===device),participants:all('participants').filter(x=>profile&&x.email===profile.email)});
  }
  if(p==='/api/results'&&method==='GET')return json(res,200,results(url.searchParams.get('event')));
  if(p==='/api/submissions'&&method==='POST'){
   const x=await body(req),e=get('events',x.eventId);if(!e||e.status!=='open')fail('This event is not accepting submissions.');
   const now=today();if(e.startDate&&now<e.startDate)fail(`This event opens on ${e.startDate}.`);
   if(e.deadline&&now>e.deadline&&!e.allowLate)fail('The submission deadline has passed.');
   const displayName=required(x.displayName,'Display name',80);if(!emailValid(x.email))fail('Enter a valid email.');const email=x.email.trim().toLowerCase();
   const roster=all('participants').find(r=>r.eventId===e.id&&r.email===email&&r.active);
   if(e.requireEnrollment&&!roster)fail('Your email is not on this event’s participant list. Contact the organizer.');
   const previous=all('submissions').filter(s=>s.eventId===e.id&&(s.profileId===device||s.email===email));
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
   let evidence='',stravaUrl='',fingerprint='',flags=[];
   if(x.method==='strava'){
    let u;try{u=new URL(x.stravaUrl);}catch{fail('Enter a valid Strava activity URL.');}
    if(!['strava.com','www.strava.com'].includes(u.hostname)||u.protocol!=='https:'||!/^\/activities\/\d+\/?$/.test(u.pathname)||u.username||u.password)fail('Use https://www.strava.com/activities/ followed by an activity number.');
    stravaUrl='https://www.strava.com'+u.pathname.replace(/\/$/,'');
    if(all('submissions').some(s=>s.stravaUrl===stravaUrl&&s.status!=='rejected'))fail('This Strava activity has already been submitted.',409);
   }else{
    const im=readableImage(x.image);fingerprint=crypto.createHash('sha256').update(im.bytes).digest('hex');
    if(all('submissions').some(s=>s.fingerprint===fingerprint))flags.push('Screenshot previously submitted');
    evidence=uuid()+'.'+im.ext;fs.writeFileSync(path.join(dataDir,'uploads',evidence),im.bytes);
   }
   if(seconds/distance<150||seconds/distance>1800)flags.push('Unusual pace — check activity details');
   const s={id:uuid(),eventId:e.id,profileId:device,displayName,email,bib:roster?.bib||'',distance,seconds,activity:x.activity,activityDate:x.activityDate,method:x.method,stravaUrl,evidence,fingerprint,notes:String(x.notes||'').slice(0,2000),status:'pending',flags,reason:'',createdAt:new Date().toISOString()};
   save('profiles',{...(get('profiles',device)||{}),id:device,name:x.name||displayName,displayName,email,country:x.country||'Trinidad & Tobago'});
   return json(res,201,save('submissions',s));
  }
  if(p.startsWith('/api/submissions/')&&method==='GET'){
   const s=get('submissions',p.split('/').pop());if(!s||s.profileId!==device)fail('Submission not found on this device.',404);return json(res,200,s);
  }
  // Local management intentionally has no login, as requested. The server binds to loopback only.
  if(p==='/api/admin/state'&&method==='GET')return json(res,200,{events:all('events'),participants:all('participants'),submissions:all('submissions'),settings:get('settings','site')});
  if(p==='/api/admin/events'&&method==='POST')return json(res,201,save('events',validateEvent(await body(req))));
  if(/^\/api\/admin\/events\/[^/]+$/.test(p)){
   const id=p.split('/').pop(),e=get('events',id);if(!e)fail('Event not found.',404);
   if(method==='PUT')return json(res,200,save('events',validateEvent(await body(req),e)));
   if(method==='DELETE'){if(e.status!=='draft')fail('Only draft events can be deleted.');if(all('submissions').some(s=>s.eventId===id)||all('participants').some(x=>x.eventId===id))fail('This draft contains participant records. Keep it as a draft.');db.prepare('DELETE FROM events WHERE id=?').run(id);return json(res,200,{ok:true});}
  }
  if(p==='/api/admin/media'&&method==='POST'){
   const im=readableImage((await body(req)).image),name='public-'+uuid()+'.'+im.ext;fs.writeFileSync(path.join(dataDir,'uploads',name),im.bytes);return json(res,201,{url:'/media/'+name});
  }
  if(/^\/media\/public-[a-f0-9-]+\.(jpg|png|webp)$/.test(p))return file(res,path.join(dataDir,'uploads',path.basename(p)));
  if(/^\/api\/admin\/evidence\/[^/]+$/.test(p)&&method==='GET'){
   const s=get('submissions',p.split('/').pop());if(!s?.evidence)fail('No screenshot for this submission.',404);return file(res,path.join(dataDir,'uploads',s.evidence),true);
  }
  if(/^\/api\/admin\/submissions\/[^/]+$/.test(p)&&method==='PATCH'){
   const s=get('submissions',p.split('/').pop()),x=await body(req);if(!s)fail('Submission not found.',404);
   if(!['approved','rejected','pending'].includes(x.status))fail('Select a review decision.');
   if(x.status==='rejected')x.reason=required(x.reason,'Rejection reason',1000);
   if(x.seconds!==undefined){const n=Number(x.seconds);if(!Number.isInteger(n)||n<1||n>172800)fail('Enter a valid time.');s.seconds=n;}
   if(x.distance!==undefined){const n=Number(x.distance),e=get('events',s.eventId);if(!Number.isFinite(n)||n<e.minDistance||n>e.maxDistance)fail('Distance is outside the event limits.');s.distance=n;}
   s.status=x.status;s.reason=x.status==='rejected'?x.reason:'';s.reviewedAt=new Date().toISOString();return json(res,200,save('submissions',s));
  }
  if(p==='/api/admin/participants'&&method==='POST')return json(res,201,save('participants',participant(await body(req))));
  if(/^\/api\/admin\/participants\/[^/]+$/.test(p)&&method==='PUT'){
   const id=p.split('/').pop(),old=get('participants',id);if(!old)fail('Participant not found.',404);return json(res,200,save('participants',participant({...old,...await body(req),id})));
  }
  if(p==='/api/admin/import'&&method==='POST'){
   const input=await body(req);if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>2000)fail('Upload between 1 and 2,000 participants.');
   const seen=new Set();const rows=input.rows.map((x,i)=>{try{const r=participant(x),key=r.eventId+':'+r.email;if(seen.has(key))fail('Duplicate participant in CSV.');seen.add(key);return r;}catch(e){fail(`Row ${i+2}: ${e.message}`);}});
   db.exec('BEGIN');try{rows.forEach(r=>save('participants',r));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,201,{count:rows.length});
  }
  if(p==='/api/admin/settings'&&method==='PUT'){
   const x=await body(req);x.id='site';x.name=required(x.name,'Organization name',100);if(!emailValid(x.email))fail('Enter a valid contact email.');
   x.maxUploadMB=Number(x.maxUploadMB);if(!Number.isFinite(x.maxUploadMB)||x.maxUploadMB<1||x.maxUploadMB>20)fail('Upload limit must be 1–20 MB.');
   for(const k of ['tagline','phone','instagram'])x[k]=String(x[k]||'').slice(0,250);
   if(!/^https:\/\/www\.instagram\.com\/[\w.]+\/?$/.test(x.instagram))fail('Use a valid Instagram profile URL.');return json(res,200,save('settings',x));
  }
  if(p.startsWith('/api/'))fail('This action was not found.',404);
  if(p.startsWith('/assets/')||['/app.js','/styles.css','/experience.js','/experience.css','/completion.js'].includes(p)){
   const target=path.resolve(root,'public','.'+p);if(!target.startsWith(path.join(root,'public')+path.sep))fail('Not found.',404);return file(res,target);
  }
  if(method!=='GET')fail('Method not allowed.',405);
  if(p==='/'||p==='/RISENRUNTT_website.html'||/^\/(events|results|my-runs|profile|how-it-works|about|faq|admin)(\/[^.]*)?$/.test(p))return file(res,path.join(root,'public','index.html'),true);
  fail('Page not found.',404);
 }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});else res.end();if(!e.status)console.error(e);}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Rise & Run TT: http://localhost:${process.env.PORT||4173} — local storage ready`));
