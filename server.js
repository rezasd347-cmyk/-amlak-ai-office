const express=require('express');
const session=require('express-session');
const pgSession=require('connect-pg-simple')(session);
const bcrypt=require('bcryptjs');
const path=require('path');
const fs=require('fs');
const fsp=fs.promises;
const crypto=require('crypto');
const {Pool}=require('pg');
const multer=require('multer');
const sharp=require('sharp');
const {S3Client,PutObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
const {createRouter: createAgentRouter,startMissionWorker}=require('./agents');
const {ensureFoundation,userTier,hasTier,requireTier}=require('./foundation');
const {SERVICES}=require('./service-catalog');
const {createOmniRouter}=require('./omni-agent');
const {listAgents}=require('./agent-registry');
const {createGuideRouter}=require('./guide-ai');
const {createMediaRouter}=require('./media-studio');
const {createPaymentRouter}=require('./payment-gateway');
const {runMaintenance,startMaintenanceAgent}=require('./maintenance-agent');

const app=express();
if(process.env.NODE_ENV==='production'&&!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET_REQUIRED_IN_PRODUCTION');
const PORT=Number(process.env.PORT||10000);
const SCHEMA_VERSION=3;
const MAX_FILE=20*1024*1024;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_FILE}});
const STORAGE_BUCKET=process.env.STORAGE_BUCKET||'amlak-media';
const LOCAL_MEDIA_DIR=path.join(__dirname,'data','media');
const s3=new S3Client({
  region:process.env.AWS_REGION||'auto',
  endpoint:process.env.AWS_ENDPOINT_URL_S3,
  forcePathStyle:true,
  credentials:process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY
    ? {accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}:undefined
});

const PROPERTY_TYPES={
  مسکونی:['آپارتمان','ویلایی','برج/واحد برج','پنت‌هاوس','دوبلکس','تریبلکس','تاون‌هاوس','مجتمع مسکونی','شهرک','باغ‌ویلا','خانه','زمین مسکونی'],
  تجاری:['مغازه','واحد تجاری','پاساژ','مجتمع تجاری','مرکز خرید','رستوران','کافه','هتل','انبار تجاری','ملک تجاری چندمنظوره'],
  اداری:['دفتر کار','واحد اداری','ساختمان اداری','مجتمع اداری','مرکز اداری'],
  صنعتی:['کارخانه','کارگاه','سوله','انبار','شهرک صنعتی','زمین صنعتی','مجتمع صنعتی'],
  کشاورزی:['زمین زراعی','باغ','باغ میوه','زمین کشاورزی','دامداری','مرغداری','گلخانه','مزرعه','زمین باغی'],
  خدماتی:['مجتمع خدماتی','مجتمع پزشکان','درمانگاه','کلینیک','مطب','جایگاه سوخت','کارواش','مجتمع بین‌راهی','خدمات خودرو','سایر خدماتی'],
  زمین:['زمین مسکونی','زمین تجاری','زمین اداری','زمین صنعتی','زمین کشاورزی','زمین گردشگری','زمین خام'],
  گردشگری_اقامتی:['هتل','هتل‌آپارتمان','اقامتگاه','بوم‌گردی','ویلا اقامتی','مجتمع گردشگری'],
  آموزشی:['مدرسه','آموزشگاه','دانشگاه/موسسه','مهدکودک'],
  درمانی:['بیمارستان','درمانگاه','کلینیک','مطب','مجتمع پزشکی'],
  ورزشی_تفریحی:['باشگاه','مجموعه ورزشی','استخر','سالن','پارک تفریحی','مجموعه تفریحی'],
  سایر:['سایر']
};

function empty(){
  return {schema_version:SCHEMA_VERSION,staff:[],properties:[],clients:[],followups:[],activities:[],
    seq:{staff:1,properties:1,clients:1,followups:1,activities:1}};
}
let store;
if(!process.env.DATABASE_URL) console.error('DATABASE_URL تنظیم نشده است.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});

async function ensureTables(){
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state(
    id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state_backups(
    id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    schema_version INTEGER NOT NULL,data JSONB NOT NULL)`);
}
function next(k){const n=Number(store.seq[k]||1);store.seq[k]=n+1;return n}
function now(){return new Date().toISOString()}
function clean(v){return String(v??'').trim()}
function actor(req){return req.session.user||null}
async function persist(){await pool.query('UPDATE app_state SET data=$1,updated_at=now() WHERE id=1',[JSON.stringify(store)])}
async function backup(label='migration'){
  await pool.query('INSERT INTO app_state_backups(schema_version,data) VALUES($1,$2)',[store.schema_version,JSON.stringify(store)]);
}
function normalizeProperty(p){
  const media=Array.isArray(p.media)?p.media:[];
  return {...p,
    property_type:p.property_type||p.purpose||'',
    property_subtype:p.property_subtype||'',
    description:p.description||p.notes||'',
    owner_notes:p.owner_notes||'',
    raw_voice:p.raw_voice||'',
    media,
    map:p.map||((p.lat||p.lng)?{latitude:p.lat||null,longitude:p.lng||null,formatted_address:'',google_maps_url:''}:null),
    virtual_tour:p.virtual_tour||{mode:'standard',scenes:[]},
    ai_extraction:p.ai_extraction||null
  };
}
function migrate(d){
  const e=empty();
  const out={...e,...d,seq:{...e.seq,...(d.seq||{})},activities:Array.isArray(d.activities)?d.activities:[]};
  out.properties=(Array.isArray(d.properties)?d.properties:[]).map(normalizeProperty);
  out.schema_version=SCHEMA_VERSION;
  return out;
}
async function load(){
  const {rows}=await pool.query('SELECT data FROM app_state WHERE id=1');
  if(!rows.length){const e=empty();await pool.query('INSERT INTO app_state(id,data) VALUES(1,$1)',[JSON.stringify(e)]);return e}
  const d=rows[0].data||{};
  if(Number(d.schema_version||1)<SCHEMA_VERSION){
    store=migrate(d); await backup('pre-migration'); await persist(); return store;
  }
  return migrate(d);
}
async function audit(req,action,entity,entityId,details=''){
  const u=actor(req);if(!u)return;
  store.activities.push({id:next('activities'),user_id:u.id,user_name:u.name,action,entity,entity_id:entityId,details,created_at:now()});
  if(store.activities.length>10000)store.activities=store.activities.slice(-10000);
  await persist();
}
app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');next()});
const rateBuckets=new Map();
app.use((req,res,next)=>{if(!req.path.startsWith('/api/'))return next();const key=(req.ip||'unknown')+':'+req.path;const nowMs=Date.now();let b=rateBuckets.get(key);if(!b||nowMs-b.t>60000)b={t:nowMs,n:0};b.n++;rateBuckets.set(key,b);if(b.n>120)return res.status(429).json({error:'RATE_LIMITED'});next()});
app.use(express.json({limit:'20mb'}));app.use(express.urlencoded({extended:true}));
app.set('trust proxy',1);
app.use(session({store:new pgSession({pool,tableName:'user_sessions',createTableIfMissing:true}),secret:process.env.SESSION_SECRET||'change-this-secret',resave:false,saveUninitialized:false,
  cookie:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:14*86400000}}));
function auth(req,res,next){if(!req.session.user)return res.status(401).json({error:'AUTH_REQUIRED'});next()}
function admin(req,res,next){if(req.session.user?.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'});next()}
function visibleForUser(items,req){return req.session.user.role==='admin'?items:items.filter(x=>!x.assigned_to||Number(x.assigned_to)===Number(req.session.user.id))}
function publicUser(x){const {password_hash,...safe}=x;return safe}

async function init(){
  await ensureFoundation(pool);
  const email=clean(process.env.ADMIN_EMAIL);
  if(email&&!store.staff.some(x=>String(x.email||'').toLowerCase()===email.toLowerCase())){
    store.staff.push({id:next('staff'),name:'مدیر دفتر',email,password_hash:null,role:'admin',active:true,created_at:now()});
    await persist();
  }
}
app.get('/api/maintenance/run',auth,async(req,res)=>{if(req.session.user?.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'});res.json(await runMaintenance(pool))});
app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,version:SCHEMA_VERSION,storage:'postgres',time:now()})}catch(e){res.status(500).json({ok:false,error:'DB_UNAVAILABLE'})}});
app.get('/api/property-types',(req,res)=>res.json(PROPERTY_TYPES));

app.post('/api/offline/sync',auth,async(req,res)=>{
 const x=req.body||{},method=String(x.method||'GET').toUpperCase(),path=String(x.path||''),body=x.body&&typeof x.body==='object'?x.body:{},key=String(x.idempotency_key||'');
 const allowed=[['POST',p=>p==='/api/properties'],['PATCH',p=>/^\/api\/properties\/\d+$/.test(p)],['POST',p=>p==='/api/clients'],['PATCH',p=>/^\/api\/clients\/\d+$/.test(p)],['POST',p=>p==='/api/followups'],['PATCH',p=>/^\/api\/followups\/\d+$/.test(p)],['DELETE',p=>/^\/api\/followups\/\d+$/.test(p)]];
 if(!allowed.some(([m,test])=>m===method&&test(path)))return res.status(400).json({error:'OFFLINE_ROUTE_NOT_ALLOWED'});
 if(!key)return res.status(400).json({error:'IDEMPOTENCY_REQUIRED'});
 const prev=await pool.query('SELECT response FROM idempotency_keys WHERE key=$1 AND user_id=$2',[key,req.session.user.id]);
 if(prev.rows[0])return res.json(prev.rows[0].response);
 let result;
 if(method==='POST'&&path==='/api/properties'){const t=now(),p=normalizeProperty({...body,id:next('properties'),status:body.status||'active',assigned_to:req.session.user.role==='admin'?(body.assigned_to||null):req.session.user.id,created_by:req.session.user.id,created_at:t,updated_at:t});store.properties.push(p);result={id:p.id,property:p}}
 else if(method==='PATCH'&&/^\\/api\\/properties\\/\\d+$/.test(path)){const p=store.properties.find(v=>String(v.id)===path.split('/').pop());if(!p)return res.status(404).json({error:'PROPERTY_NOT_FOUND'});if(!visibleForUser([p],req).length)return res.status(403).json({error:'FORBIDDEN'});Object.assign(p,body,{updated_at:now()});normalizeProperty(p);result={ok:true,property:p}}
 else if(method==='POST'&&path==='/api/clients'){const t=now(),c={...body,id:next('clients'),assigned_to:req.session.user.role==='admin'?(body.assigned_to||null):req.session.user.id,created_by:req.session.user.id,created_at:t,updated_at:t};store.clients.push(c);result={id:c.id}}
 else if(method==='PATCH'&&/^\\/api\\/clients\\/\\d+$/.test(path)){const c=store.clients.find(v=>String(v.id)===path.split('/').pop());if(!c)return res.status(404).json({error:'CLIENT_NOT_FOUND'});if(!visibleForUser([c],req).length)return res.status(403).json({error:'FORBIDDEN'});Object.assign(c,body,{updated_at:now()});result={ok:true}}
 else if(method==='POST'&&path==='/api/followups'){const f={...body,id:next('followups'),status:body.status||'open',assigned_to:req.session.user.role==='admin'?(body.assigned_to||null):req.session.user.id,created_by:req.session.user.id,created_at:now()};store.followups.push(f);result={id:f.id}}
 else if(method==='PATCH'&&/^\\/api\\/followups\\/\\d+$/.test(path)){const f=store.followups.find(v=>String(v.id)===path.split('/').pop());if(!f)return res.status(404).json({error:'FOLLOWUP_NOT_FOUND'});if(!visibleForUser([f],req).length)return res.status(403).json({error:'FORBIDDEN'});Object.assign(f,body,{updated_at:now()});result={ok:true}}
 else if(method==='DELETE'&&/^\\/api\\/followups\\/\\d+$/.test(path)){const i=store.followups.findIndex(v=>String(v.id)===path.split('/').pop());if(i<0)return res.status(404).json({error:'FOLLOWUP_NOT_FOUND'});const f=store.followups[i];if(!visibleForUser([f],req).length)return res.status(403).json({error:'FORBIDDEN'});store.followups.splice(i,1);result={ok:true}}
 await persist();
 await pool.query('INSERT INTO idempotency_keys(key,user_id,operation,response,expires_at) VALUES($1,$2,$3,$4,now()+interval \'7 days\') ON CONFLICT(key) DO NOTHING',[key,req.session.user.id,method+' '+path,JSON.stringify(result)]);
 return res.json(result);
});

app.post('/api/login',async(req,res)=>{
 const email=clean(req.body?.email),password=String(req.body?.password||'');if(!email)return res.status(400).json({error:'ایمیل را وارد کنید'});
 const adminEmail=clean(process.env.ADMIN_EMAIL);let u=store.staff.find(x=>String(x.email||'').toLowerCase()===email.toLowerCase());
 if(!u&&adminEmail&&email.toLowerCase()===adminEmail.toLowerCase()){u={id:next('staff'),name:'مدیر دفتر',email:adminEmail,password_hash:null,role:'admin',active:true,created_at:now()};store.staff.push(u);await persist()}
 if(!u)return res.status(401).json({error:'حساب کاربری پیدا نشد'});if(!u.active)return res.status(401).json({error:'حساب فعال نیست'});
 const envPass=process.env.ADMIN_PASSWORD?String(process.env.ADMIN_PASSWORD):null;
 if(!u.password_hash){if(u.role==='admin'&&envPass&&password===envPass){u.password_hash=bcrypt.hashSync(envPass,12);await persist()}else return res.status(401).json({error:'رمز عبور تنظیم نشده یا اشتباه است'})}
 else if(!password||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:'رمز عبور اشتباه است'});
 const sub=(await pool.query('SELECT tier,status,current_period_end,account_type FROM subscriptions WHERE user_id=$1',[u.id])).rows[0];
 const tier=u.role==='admin'?'enterprise':(sub?.status==='active'?sub.tier:'free');
 req.session.user={id:u.id,name:u.name,email:u.email,role:u.role,subscription_tier:tier,account_type:sub?.account_type||'consumer'};await audit(req,'login','session',u.id,'ورود به سیستم');res.json(req.session.user);
});
app.post('/api/logout',async(req,res)=>{const u=req.session.user;req.session.destroy(async()=>{if(u){store.activities.push({id:next('activities'),user_id:u.id,user_name:u.name,action:'logout',entity:'session',entity_id:u.id,details:'خروج',created_at:now()});await persist()}res.json({ok:true})})});
app.get('/api/me',auth,(req,res)=>res.json(req.session.user));

app.get('/api/staff',admin,async(req,res)=>{const subs=(await pool.query('SELECT user_id,tier,status FROM subscriptions')).rows;const sm=new Map(subs.map(x=>[Number(x.user_id),x]));res.json(store.staff.map(x=>{const s=publicUser(x),sub=sm.get(Number(x.id));return {...s,subscription_tier:x.role==='admin'?'enterprise':(sub?.status==='active'?sub.tier:'free')}}).sort((a,b)=>a.name.localeCompare(b.name,'fa')));});
app.post('/api/signup',async(req,res)=>{const name=clean(req.body?.name),email=clean(req.body?.email),password=String(req.body?.password||'');if(!name||!email||password.length<6)return res.status(400).json({error:'نام، ایمیل و رمز حداقل ۶ کاراکتر لازم است'});if(store.staff.some(x=>x.email.toLowerCase()===email.toLowerCase()))return res.status(409).json({error:'ایمیل تکراری'});const x={id:next('staff'),name,email,password_hash:bcrypt.hashSync(password,12),role:'staff',active:false,created_at:now()};store.staff.push(x);await persist();res.json({ok:true,pending:true})});
app.post('/api/staff',admin,async(req,res)=>{const name=clean(req.body?.name),email=clean(req.body?.email),password=String(req.body?.password||'');if(!name||!email||password.length<6)return res.status(400).json({error:'نام، ایمیل و رمز حداقل ۶ کاراکتر لازم است'});if(store.staff.some(x=>x.email.toLowerCase()===email.toLowerCase()))return res.status(409).json({error:'ایمیل تکراری'});const x={id:next('staff'),name,email,password_hash:bcrypt.hashSync(password,12),role:req.body.role==='admin'?'admin':'staff',active:true,created_at:now()};store.staff.push(x);await persist();await audit(req,'create','staff',x.id,`ایجاد ${x.name}`);res.json(publicUser(x))});
app.patch('/api/staff/:id',admin,async(req,res)=>{const x=store.staff.find(s=>s.id==req.params.id);if(!x)return res.status(404).json({error:'کاربر پیدا نشد'});if(req.body.name)x.name=clean(req.body.name);if(req.body.email)x.email=clean(req.body.email);if(req.body.role)x.role=req.body.role==='admin'?'admin':'staff';if(typeof req.body.active==='boolean'){if(x.role==='admin'&&!req.body.active&&store.staff.filter(s=>s.role==='admin'&&s.active).length<=1)return res.status(400).json({error:'حداقل یک مدیر فعال لازم است'});x.active=req.body.active}if(req.body.password)x.password_hash=bcrypt.hashSync(String(req.body.password),12);await persist();await audit(req,'update','staff',x.id,`ویرایش ${x.name}`);res.json(publicUser(x))});

function enrichProperty(p){return {...p,assigned_name:store.staff.find(s=>s.id==p.assigned_to)?.name||null}}
app.get('/api/properties',auth,(req,res)=>res.json(visibleForUser(store.properties,req).map(enrichProperty).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))));
app.get('/api/properties/:id',auth,(req,res)=>{const p=store.properties.find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});if(!visibleForUser([p],req).length)return res.status(403).json({error:'دسترسی ندارید'});res.json(enrichProperty(p))});
app.post('/api/properties',auth,async(req,res)=>{const x=req.body||{},t=now();const p=normalizeProperty({...x,id:next('properties'),lat:x.lat||null,lng:x.lng||null,status:x.status||'active',assigned_to:req.session.user.role==='admin'?(x.assigned_to||null):req.session.user.id,created_by:req.session.user.id,created_at:t,updated_at:t});store.properties.push(p);await persist();await audit(req,'create','property',p.id,`ثبت ${p.title||p.property_subtype||''}`);res.json({id:p.id,property:p})});
app.patch('/api/properties/:id',auth,async(req,res)=>{const p=store.properties.find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});if(!visibleForUser([p],req).length)return res.status(403).json({error:'دسترسی ندارید'});Object.assign(p,req.body,{updated_at:now()});normalizeProperty(p);await persist();await audit(req,'update','property',p.id,`ویرایش ${p.title||''}`);res.json({ok:true,property:p})});
app.delete('/api/properties/:id',admin,async(req,res)=>{const p=store.properties.find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});p.status='inactive';p.updated_at=now();await persist();await audit(req,'archive','property',p.id,'غیرفعال‌سازی');res.json({ok:true})});

function ext(name){return (path.extname(name||'').slice(1)||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg'}
function mediaKind(mime){return String(mime||'').startsWith('video/')?'video':'photo'}
function publicS3Url(key){const base=String(process.env.AWS_PUBLIC_BASE_URL||process.env.AWS_ENDPOINT_URL_S3||'').replace(/\/$/,'');return base?base+'/'+STORAGE_BUCKET+'/'+key:'/media/'+key}
async function put(key,buffer,type){if(process.env.AWS_ENDPOINT_URL_S3&&process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY){await s3.send(new PutObjectCommand({Bucket:STORAGE_BUCKET,Key:key,Body:buffer,ContentType:type}));return publicS3Url(key)}const file=path.join(LOCAL_MEDIA_DIR,key);await fsp.mkdir(path.dirname(file),{recursive:true});await fsp.writeFile(file,buffer);return '/media/'+key}
app.post('/api/properties/:id/media',auth,upload.array('files',20),async(req,res)=>{try{const p=store.properties.find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});if(!visibleForUser([p],req).length)return res.status(403).json({error:'دسترسی ندارید'});if(!process.env.AWS_ENDPOINT_URL_S3||!process.env.AWS_ACCESS_KEY_ID){/* local filesystem fallback for offline/local deployment */}const files=req.files||[];if(!files.length)return res.status(400).json({error:'فایلی انتخاب نشده'});p.media=Array.isArray(p.media)?p.media:[];const added=[];for(const f of files){const id=crypto.randomUUID();const kind=mediaKind(f.mimetype);const e=ext(f.originalname);const folder=kind==='video'?'videos':'photos';const key=`properties/${p.id}/${folder}/${id}.${e}`;const url=await put(key,f.buffer,f.mimetype);let thumb_url=url;if(kind==='photo'){const tb=await sharp(f.buffer).resize({width:480,withoutEnlargement:true}).jpeg({quality:78}).toBuffer();thumb_url=await put(`properties/${p.id}/photos/thumbs/${id}.jpg`,tb,'image/jpeg')}const item={id,url,thumb_url,type:kind,mime:f.mimetype,name:f.originalname,size:f.size,order:p.media.length+added.length,is_primary:p.media.length===0&&added.length===0,created_at:now(),key};p.media.push(item);added.push(item)}p.image=(p.media.find(x=>x.is_primary)||p.media[0])?.url||p.image;p.updated_at=now();await persist();await audit(req,'upload','media',p.id,`${added.length} فایل برای ملک`);res.json({media:added,all:p.media})}catch(e){console.error(e);res.status(500).json({error:'خطا در آپلود رسانه'})}});
app.patch('/api/properties/:id/media',auth,async(req,res)=>{const p=store.properties.find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});if(!visibleForUser([p],req).length)return res.status(403).json({error:'دسترسی ندارید'});const ids=Array.isArray(req.body?.order)?req.body.order.map(String):null;const primary=clean(req.body?.primary_id);if(ids){const by=new Map((p.media||[]).map(x=>[String(x.id),x]));p.media=ids.map(id=>by.get(id)).filter(Boolean);p.media.forEach((x,i)=>x.order=i)}if(primary){p.media.forEach(x=>x.is_primary=String(x.id)===primary);const m=p.media.find(x=>x.is_primary);if(m)p.image=m.url}p.updated_at=now();await persist();res.json({ok:true,media:p.media})});
app.delete('/api/properties/:id/media/:mediaId',auth,async(req,res)=>{const p=store.properties.find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});if(!visibleForUser([p],req).length)return res.status(403).json({error:'دسترسی ندارید'});const m=(p.media||[]).find(x=>String(x.id)===String(req.params.mediaId));if(!m)return res.status(404).json({error:'رسانه پیدا نشد'});try{if(m.key){if(process.env.AWS_ENDPOINT_URL_S3&&process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY)await s3.send(new DeleteObjectCommand({Bucket:STORAGE_BUCKET,Key:m.key}));else await fsp.rm(path.join(LOCAL_MEDIA_DIR,m.key),{force:true})}}catch{}p.media=p.media.filter(x=>String(x.id)!==String(req.params.mediaId));if(m.is_primary&&p.media[0]){p.media[0].is_primary=true;p.image=p.media[0].url}p.updated_at=now();await persist();res.json({ok:true,media:p.media})});

app.post('/api/properties/:id/map',auth,async(req,res)=>{const p=store.properties.find(x=>x.id==req.params.id);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});if(!visibleForUser([p],req).length)return res.status(403).json({error:'دسترسی ندارید'});const lat=Number(req.body.lat),lng=Number(req.body.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng))return res.status(400).json({error:'مختصات نامعتبر است'});p.lat=lat;p.lng=lng;p.map={latitude:lat,longitude:lng,formatted_address:clean(req.body.formatted_address),google_maps_url:`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`};p.updated_at=now();await persist();res.json({ok:true,map:p.map})});

app.post('/api/ai/property-parse',auth,async(req,res)=>{
  const text=clean(req.body?.text);if(!text)return res.status(400).json({error:'متن وارد نشده'});
  const out={raw:text,fields:{},uncertain:[]};
  const nums=(re)=>{const m=text.match(re);return m?Number(m[1]):null};
  const area=nums(/(\d+(?:\.\d+)?)\s*(?:متر|متری)/);if(area)out.fields.area=area;
  const bed=nums(/(\d+)\s*خواب/);if(bed!=null)out.fields.bedrooms=bed;
  const year=nums(/(?:ساخت|سال ساخت)\s*(?:سال)?\s*(\d{2,4})/);if(year)out.fields.build_year=year<100?1400+year:year;
  const floor=nums(/طبقه\s*(?:ی|ا)?\s*(\d+)/);if(floor!=null)out.fields.floor=floor;
  if(/آسانسور/.test(text))out.fields.elevator=!/بدون\s*آسانسور/.test(text);
  if(/پارکینگ/.test(text))out.fields.parking=!/بدون\s*پارکینگ/.test(text);
  const dealMap=[['رهن و اجاره',/رهن\s*(?:و|\/)\s*اجاره/],['رهن',/\bرهن\b/],['اجاره',/اجاره/],['مشارکت',/مشارکت/],['فروش',/فروش/]];
  for(const [label,re] of dealMap){if(re.test(text)){out.fields.deal=label;break}}
  const CITIES=['تهران','مشهد','اصفهان','شیراز','تبریز','کرج','قم','اهواز','کرمانشاه','رشت','یزد','ساری','بابل','نور','آمل','قزوین','گرگان','زنجان','ارومیه','همدان','کیش','چالوس','نوشهر','محمودآباد'];
  for(const c of CITIES){if(text.includes(c)){out.fields.city=c;break}}
  const toNum=(s)=>Number(String(s).replace(/[,٬۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.includes(d)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(d):d).replace(/,/g,''));
  const priceMil=(re)=>{const m=text.match(re);return m?Math.round(toNum(m[1])*1000000):null};
  const priceBil=(re)=>{const m=text.match(re);return m?Math.round(toNum(m[1])*1000000000):null};
  const p1=priceBil(/(\d+(?:\.\d+)?)\s*میلیارد/),p2=priceMil(/(\d+(?:\.\d+)?)\s*میلیون/);
  const totalPrice=(p1||0)+(p2||0);
  if(/رهن|ودیعه/.test(text)&&totalPrice)out.fields.deposit=totalPrice;
  else if(/اجار[ه ه]*\s*(?:ماهیانه|ماهانه)?/.test(text)&&totalPrice&&(out.fields.deal||'').includes('اجاره'))out.fields.rent=totalPrice;
  else if(totalPrice)out.fields.price=totalPrice;
  for(const [k,v] of Object.entries(PROPERTY_TYPES)){if(text.includes(k.replace('_','/'))||text.includes(k)){out.fields.property_type=k;break}if(v.some(s=>text.includes(s))){out.fields.property_subtype=v.find(s=>text.includes(s));break}}
  const aiUrl=clean(process.env.AI_BASE_URL),aiKey=clean(process.env.AI_API_KEY),model=clean(process.env.AI_MODEL);
  if(aiUrl&&aiKey&&model){try{const r=await fetch(`${aiUrl.replace(/\/$/,'')}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${aiKey}`},body:JSON.stringify({model,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:'Extract only explicit real-estate facts from Persian text. Never guess. Return JSON with fields only: property_type,property_subtype,area,land_area,bedrooms,floor,build_year,parking,elevator,city,neighborhood,deal,price,deposit,rent,features,address. Unknown fields must be omitted.'},{role:'user',content:text}]})});if(r.ok){const j=await r.json();const parsed=JSON.parse(j.choices?.[0]?.message?.content||'{}');out.fields={...out.fields,...parsed};out.provider='ai'}}catch(e){out.ai_error='AI service unavailable'}}else out.provider='local';
  out.uncertain=[];res.json(out);
});

app.get('/api/clients',auth,(req,res)=>res.json(visibleForUser(store.clients,req).map(c=>({...c,assigned_name:store.staff.find(s=>s.id==c.assigned_to)?.name||null})).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))));
app.post('/api/clients',auth,async(req,res)=>{const x=req.body||{},t=now();const c={...x,id:next('clients'),assigned_to:req.session.user.role==='admin'?(x.assigned_to||null):req.session.user.id,created_by:req.session.user.id,created_at:t,updated_at:t};store.clients.push(c);await persist();await audit(req,'create','client',c.id,`ثبت مشتری ${c.name||''}`);res.json({id:c.id})});
app.patch('/api/clients/:id',auth,async(req,res)=>{const c=store.clients.find(x=>x.id==req.params.id);if(!c)return res.status(404).json({error:'مشتری پیدا نشد'});if(!visibleForUser([c],req).length)return res.status(403).json({error:'دسترسی ندارید'});Object.assign(c,req.body,{updated_at:now()});await persist();await audit(req,'update','client',c.id,`ویرایش ${c.name||''}`);res.json({ok:true})});
app.delete('/api/clients/:id',admin,async(req,res)=>{const i=store.clients.findIndex(x=>x.id==req.params.id);if(i<0)return res.status(404).json({error:'مشتری پیدا نشد'});const c=store.clients[i];store.clients.splice(i,1);await persist();await audit(req,'delete','client',c.id,`حذف ${c.name||''}`);res.json({ok:true})});
app.post('/api/assign',admin,async(req,res)=>{const {entity,id,assigned_to}=req.body||{},key=entity==='property'?'properties':entity==='client'?'clients':null;if(!key)return res.status(400).json({error:'entity نامعتبر'});const x=store[key].find(v=>v.id==id);if(!x)return res.status(404).json({error:'پرونده پیدا نشد'});x.assigned_to=assigned_to?Number(assigned_to):null;x.updated_at=now();await persist();await audit(req,'assign',entity,x.id,'تخصیص پرونده');res.json({ok:true})});

app.get('/api/followups',auth,(req,res)=>res.json(visibleForUser(store.followups,req).map(f=>({...f,client_name:store.clients.find(c=>c.id==f.client_id)?.name||null,property_title:store.properties.find(p=>p.id==f.property_id)?.title||null,assigned_name:store.staff.find(s=>s.id==f.assigned_to)?.name||null})).sort((a,b)=>String(a.due_at||'').localeCompare(String(b.due_at||'')))));
app.post('/api/followups',auth,async(req,res)=>{const x=req.body||{},f={...x,id:next('followups'),status:'open',assigned_to:req.session.user.role==='admin'?(x.assigned_to||null):req.session.user.id,created_by:req.session.user.id,created_at:now()};store.followups.push(f);await persist();await audit(req,'create','followup',f.id,`ثبت پیگیری ${f.title||''}`);res.json({id:f.id})});
app.patch('/api/followups/:id',auth,async(req,res)=>{const f=store.followups.find(x=>x.id==req.params.id);if(!f)return res.status(404).json({error:'پیگیری پیدا نشد'});if(!visibleForUser([f],req).length)return res.status(403).json({error:'دسترسی ندارید'});Object.assign(f,req.body);if(f.status==='done'){f.completed_at=now();f.completed_by=req.session.user.id}f.updated_at=now();await persist();await audit(req,f.status==='done'?'complete':'update','followup',f.id,`پیگیری ${f.title||''}`);res.json({ok:true})});
app.delete('/api/followups/:id',auth,async(req,res)=>{const i=store.followups.findIndex(x=>x.id==req.params.id);if(i<0)return res.status(404).json({error:'پیگیری پیدا نشد'});const f=store.followups[i];if(!visibleForUser([f],req).length)return res.status(403).json({error:'دسترسی ندارید'});store.followups.splice(i,1);await persist();await audit(req,'delete','followup',f.id,`حذف ${f.title||''}`);res.json({ok:true})});

function score(c,p){let s=0,max=0,why=[];function exact(a,b,w,label){if(a){max+=w;if(b&&String(a).toLowerCase()===String(b).toLowerCase()){s+=w;why.push(label)}}}exact(c.purpose||c.property_type,p.purpose||p.property_type,18,'نوع ملک');exact(c.deal,p.deal,18,'نوع معامله');if(c.city){max+=10;if(String(p.city||'').includes(c.city)){s+=10;why.push('شهر')}}if(c.neighborhood){max+=10;if(String(p.neighborhood||'').includes(c.neighborhood)){s+=10;why.push('محله')}}if(c.min_area||c.max_area){max+=14;const a=Number(p.area);if(a&&(!c.min_area||a>=Number(c.min_area))&&(!c.max_area||a<=Number(c.max_area))){s+=14;why.push('متراژ')}}if(c.min_budget||c.max_budget){max+=16;const v=Number(p.price||0)||Number(p.deposit||0)||Number(p.rent||0);if(v&&(!c.min_budget||v>=Number(c.min_budget))&&(!c.max_budget||v<=Number(c.max_budget))){s+=16;why.push('بودجه')}}if(c.bedrooms){max+=7;if(Number(p.bedrooms)>=Number(c.bedrooms)){s+=7;why.push('خواب')}}return{score:max?Math.round(s/max*100):0,why}}
app.get('/api/match/:clientId',auth,(req,res)=>{const c=store.clients.find(x=>x.id==req.params.clientId);if(!c)return res.status(404).json({error:'مشتری پیدا نشد'});res.json(visibleForUser(store.properties,req).filter(x=>x.status==='active').map(p=>({...p,...score(c,p)})).sort((a,b)=>b.score-a.score).slice(0,50))});
app.get('/api/property-matches/:propertyId',auth,(req,res)=>{const p=store.properties.find(x=>x.id==req.params.propertyId);if(!p)return res.status(404).json({error:'ملک پیدا نشد'});res.json(visibleForUser(store.clients,req).map(c=>({...c,...score(c,p)})).sort((a,b)=>b.score-a.score).slice(0,50))});
app.get('/api/search',auth,(req,res)=>{const q=clean(req.query.q).toLowerCase();if(!q)return res.json([]);const terms=q.split(/\s+/).filter(Boolean),hit=v=>terms.every(t=>String(v||'').toLowerCase().includes(t));const ps=visibleForUser(store.properties,req).filter(x=>[x.title,x.city,x.neighborhood,x.address,x.owner,x.features,x.purpose,x.property_type,x.property_subtype].some(hit)).map(x=>({id:x.id,name:x.title||x.property_subtype,city:x.city,neighborhood:x.neighborhood,phone:x.phone,type:'ملک'}));const cs=visibleForUser(store.clients,req).filter(x=>[x.name,x.phone,x.city,x.neighborhood,x.must_have,x.purpose,x.deal].some(hit)).map(x=>({id:x.id,name:x.name,city:x.city,neighborhood:x.neighborhood,phone:x.phone,type:'مشتری'}));res.json([...ps,...cs].slice(0,100))});

function dateRange(from,to){const f=from?new Date(from):new Date(Date.now()-30*86400000),t=to?new Date(to):new Date();t.setHours(23,59,59,999);return{f,t}}
function reportFor(userId,from,to){const {f,t}=dateRange(from,to),acts=store.activities.filter(a=>a.user_id==userId&&new Date(a.created_at)>=f&&new Date(a.created_at)<=t),props=store.properties.filter(p=>p.assigned_to==userId),clients=store.clients.filter(c=>c.assigned_to==userId),fu=store.followups.filter(x=>x.assigned_to==userId),inRange=fu.filter(x=>new Date(x.created_at)>=f&&new Date(x.created_at)<=t);const typeCount=ty=>inRange.filter(x=>x.type===ty).length;const completedInRange=fu.filter(x=>x.status==='done'&&new Date(x.completed_at||x.updated_at)>=f&&new Date(x.completed_at||x.updated_at)<=t);return{user:store.staff.find(s=>s.id==userId)?.name||'نامشخص',from:f.toISOString(),to:t.toISOString(),metrics:{new_properties:props.filter(p=>new Date(p.created_at)>=f&&new Date(p.created_at)<=t).length,new_clients:clients.filter(c=>new Date(c.created_at)>=f&&new Date(c.created_at)<=t).length,followups_created:inRange.length,followups_completed:completedInRange.length,followups_overdue:fu.filter(x=>x.status==='open'&&x.due_at&&new Date(x.due_at)<new Date()).length,followups_with_result:completedInRange.filter(x=>x.notes&&String(x.notes).trim()).length,calls:typeCount('تماس'),meetings:typeCount('جلسه'),visits:typeCount('بازدید'),messages:typeCount('پیام'),activity_count:acts.length},activities:acts.slice(-500),followups:inRange}}
app.get('/api/reports/staff/:id',admin,(req,res)=>res.json(reportFor(req.params.id,req.query.from,req.query.to)));
app.get('/api/reports/staff/:id/html',admin,(req,res)=>{const r=reportFor(req.params.id,req.query.from,req.query.to);res.type('html').send(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>گزارش عملکرد ${r.user}</title><style>body{font-family:Tahoma;max-width:900px;margin:30px auto;padding:20px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{border:1px solid #ddd;border-radius:12px;padding:16px}.n{font-size:28px;font-weight:bold}@media print{button{display:none}}</style><button onclick="print()">چاپ / ذخیره PDF</button><h1>گزارش عملکرد ${r.user}</h1><p>${r.from.slice(0,10)} تا ${r.to.slice(0,10)}</p><div class="grid">${Object.entries(r.metrics).map(([k,v])=>`<div class="card">${k}<div class="n">${v}</div></div>`).join('')}</div></html>`)});
app.get('/api/activities',admin,(req,res)=>{let a=store.activities.slice().sort((x,y)=>new Date(y.created_at)-new Date(x.created_at));if(req.query.user_id)a=a.filter(x=>x.user_id==req.query.user_id);res.json(a.slice(0,500))});
app.get('/api/dashboard',auth,(req,res)=>{const ps=visibleForUser(store.properties,req),cs=visibleForUser(store.clients,req),fs=visibleForUser(store.followups,req),today=new Date().toISOString().slice(0,10);res.json({properties:ps.filter(x=>x.status==='active').length,clients:cs.length,openFollowups:fs.filter(x=>x.status==='open').length,todayFollowups:fs.filter(x=>x.status==='open'&&String(x.due_at||'').slice(0,10)===today).length,overdue:fs.filter(x=>x.status==='open'&&x.due_at&&new Date(x.due_at)<new Date()).length,newProperties:ps.filter(x=>new Date(x.created_at)>new Date(Date.now()-7*86400000)).length,newClients:cs.filter(x=>new Date(x.created_at)>new Date(Date.now()-7*86400000)).length,staff:store.staff.filter(x=>x.active).length,activities:store.activities.slice(-10).reverse()})});
app.get('/api/backup',admin,(req,res)=>{res.setHeader('Content-Disposition',`attachment; filename="amlak-backup-${new Date().toISOString().slice(0,10)}.json"`);res.json(store)});
app.post('/api/restore',admin,async(req,res)=>{const d=req.body;if(!d||!Array.isArray(d.staff)||!Array.isArray(d.properties)||!Array.isArray(d.clients)||!Array.isArray(d.followups))return res.status(400).json({error:'پشتیبان نامعتبر است'});await backup('pre-restore');store=migrate(d);await persist();res.json({ok:true,version:SCHEMA_VERSION})});
app.get('/api/share',admin,(req,res)=>{const host=`${req.protocol}://${req.get('host')}`;res.json({url:host,login_url:`${host}/#login`,note:'دسترسی فقط با حساب فعال سیستم ممکن است.'})});

app.get('/api/plans',(req,res)=>res.json([
  {id:'free',name:'Free',rank:0,for:['consumer'],features:['جست‌وجوی پایه','مدیریت ملک','CRM پایه','رسانه پایه']},
  {id:'plus',name:'Plus',rank:1,for:['consumer','agent'],features:['مشاور AI','هوش ملک','محتوا','تور مجازی','طراحی AI']},
  {id:'pro',name:'Pro',rank:2,for:['agent','investor','developer'],features:['مرکز فرمان','Agentها','Lead Scout','ساخت','سرمایه‌گذاری','بازار','CRM هوشمند']},
  {id:'office',name:'Office',rank:3,for:['office'],features:['چندکاربره','قرارداد','معاملات','امنیت','Developer/API']},
  {id:'enterprise',name:'Enterprise',rank:4,for:['office','developer'],features:['حاکمیت AI','Self-Healing','داده جهانی','Digital Twin','اتصال سازمانی']}
]));
app.get('/api/account',auth,async(req,res)=>{const s=(await pool.query('SELECT tier,status,account_type,current_period_end FROM subscriptions WHERE user_id=$1',[req.session.user.id])).rows[0]||{tier:'free',status:'active',account_type:'consumer'};res.json({...s,role:req.session.user.role,services:SERVICES.filter(x=>hasTier(s.tier,x.tier))})});
app.patch('/api/account',auth,async(req,res)=>{const types=['consumer','agent','office','developer','investor','owner','tenant'];const account_type=String(req.body?.account_type||'consumer');if(!types.includes(account_type))return res.status(400).json({error:'ACCOUNT_TYPE_INVALID'});await pool.query('INSERT INTO subscriptions(user_id,tier,account_type,status,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(user_id) DO UPDATE SET account_type=EXCLUDED.account_type,updated_at=now()',[req.session.user.id,userTier(req.session.user),account_type,'active']);req.session.user.account_type=account_type;res.json({ok:true,account_type})});
app.get('/api/services',auth,async(req,res)=>{const r=await pool.query('SELECT * FROM service_catalog WHERE enabled=true ORDER BY id');res.json(r.rows)});
app.patch('/api/services/:id',admin,async(req,res)=>{const id=String(req.params.id),enabled=req.body?.enabled;if(typeof enabled!=='boolean')return res.status(400).json({error:'ENABLED_BOOLEAN_REQUIRED'});const r=await pool.query('UPDATE service_catalog SET enabled=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,enabled]);if(!r.rows[0])return res.status(404).json({error:'SERVICE_NOT_FOUND'});res.json(r.rows[0])});
app.delete('/api/services/:id',admin,async(req,res)=>{const r=await pool.query('UPDATE service_catalog SET enabled=false,updated_at=now() WHERE id=$1 RETURNING id',[String(req.params.id)]);if(!r.rows[0])return res.status(404).json({error:'SERVICE_NOT_FOUND'});res.json({ok:true,id:r.rows[0].id,disabled:true})});
app.get('/api/subscription',auth,async(req,res)=>{const s=(await pool.query('SELECT tier,status,current_period_end FROM subscriptions WHERE user_id=$1',[req.session.user.id])).rows[0]||{tier:req.session.user.role==='admin'?'enterprise':'free',status:'active'};res.json({...s,tier:req.session.user.role==='admin'?'enterprise':s.tier})});
app.patch('/api/subscription',admin,async(req,res)=>{const userId=Number(req.body?.user_id),tier=String(req.body?.tier||'free').toLowerCase();if(!Number.isInteger(userId)||!['free','plus','pro','office','enterprise'].includes(tier))return res.status(400).json({error:'SUBSCRIPTION_INVALID'});await pool.query('INSERT INTO subscriptions(user_id,tier,status,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(user_id) DO UPDATE SET tier=EXCLUDED.tier,status=EXCLUDED.status,updated_at=now()',[userId,tier,'active']);res.json({ok:true,user_id:userId,tier,status:'active'})});
app.use('/api/agents',auth,createAgentRouter({pool,isAdmin:(req)=>req.session.user?.role==='admin'}));
app.use('/api/omni',auth,createOmniRouter({pool}));
app.get('/api/agent-registry',auth,requireTier('plus'),(req,res)=>res.json({agents:listAgents()}));
app.use('/api/guide',auth,createGuideRouter());
app.use('/api/media-studio',auth,createMediaRouter({pool}));
app.use('/api/billing',createPaymentRouter({pool}));

app.use(express.static(path.join(__dirname,'public')));
app.use('/media',express.static(LOCAL_MEDIA_DIR,{maxAge:'7d',immutable:true}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
(async()=>{try{await ensureTables();store=await load();await init();app.listen(PORT,'0.0.0.0',()=>{startMissionWorker(pool);startMaintenanceAgent(pool);console.log(`Amlak AI Office v${SCHEMA_VERSION} running on ${PORT}`)})}catch(e){console.error(e);process.exit(1)}})();
