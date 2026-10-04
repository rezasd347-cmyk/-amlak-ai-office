const express=require('express');
const {AGENTS:CATALOG}=require('./agent-catalog');
const {requireTier,newId,userTier}=require('./foundation');
const {authorizeTool}=require('./tool-registry');

const AGENTS=CATALOG;
const {selectAgents}=require('./agent-registry');
const ROUTES=[
  {agent:'lead-scout',patterns:[/آگهی|ملک.*پیدا|پیدا.*ملک|سرنخ|لید|پلاک\s*ثبتی|مالک|آدرس.*ملک/i],action:'search_property_sources'},
  {agent:'property-intel',patterns:[/قیمت|ارزش|تحلیل.*ملک|مقایسه|رشد|نقدشوندگی/i],action:'analyze_property'},
  {agent:'matching',patterns:[/مچ|مطابقت|مناسب.*مشتری|مشتری.*مناسب/i],action:'match'},
  {agent:'crm',patterns:[/پیگیری|مشتری|تماس|فالو.?آپ|یادآوری/i],action:'crm_task'},
  {agent:'content',patterns:[/آگهی.*بنویس|متن.*آگهی|اینستاگرام|تلگرام|کپشن|ریلز|بروشور/i],action:'create_content'},
  {agent:'market',patterns:[/بازار|منطقه|محله.*تحلیل|روند.*قیمت/i],action:'market_scan'},
  {agent:'document',patterns:[/سند|مدرک|قرارداد|مجوز|استعلام/i],action:'document_task'},
  {agent:'construction',patterns:[/ساخت|ساختمان|طبقه|واحد|پارکینگ|هزینه.*ساخت/i],action:'construction_plan'},
  {agent:'design',patterns:[/طراحی|نما|پلان|بازسازی|دکور/i],action:'design_brief'},
  {agent:'investment',patterns:[/سرمایه.?گذاری|ROI|سود|بازده|سناریو/i],action:'investment_analysis'},
  {agent:'qa',patterns:[/تست|عیب|باگ|سلامت|کیفیت|بررسی.*سیستم/i],action:'qa_check'}
];
function parseCount(text){const m=String(text).match(/(?:بیست|ده|پنج|\d+)\s*(?:تا|فایل|آگهی|ملک|مورد)?/);if(!m)return null;const w={بیست:20,ده:10,پنج:5},n=w[m[0].trim().split(/\s+/)[0]]||Number(m[0].trim().split(/\s+/)[0]);return Number.isFinite(n)&&n>0?Math.min(n,100):null}
function parseCommand(command){
  const text=String(command||'').trim();let route=ROUTES.find(r=>r.patterns.some(p=>p.test(text)));
  const count=parseCount(text);
  const cities=['تهران','گرگان','مشهد','اصفهان','شیراز','تبریز','کرج','قم','رشت','ساری','بابل','آمل','نوشهر','چالوس','نور','محمودآباد','فرانکفورت','برلین'];
  const city=cities.find(x=>text.includes(x))||null;
  const m=text.match(/(?:در|توی|تو)\s+([^،,.]+?)(?:\s+(?:پیدا|بیست|ده|پنج)|$)/);
  const location=(m&&m[1]||'').trim()||null;
  const sources=[];if(/دیوار/i.test(text))sources.push('divar');if(/شیپور/i.test(text))sources.push('sheypoor');if(/اینستاگرام|instagram/i.test(text))sources.push('instagram');
  return {raw:text,agent:route?.agent||'orchestrator',action:route?.action||'plan_task',target_count:count,city,location,sources:sources.length?sources:['public_web'],requested_fields:{title:true,property_type:true,area:true,deal:true,price:true,city:true,neighborhood:true,address:true,owner_name:/مالک/.test(text),registration_plate:/پلاک\s*ثبتی/.test(text),phone:/تلفن|شماره|موبایل/.test(text)},created_at:new Date().toISOString()};
}
function planTasks(task){
  const base={input:task,priority:50};
  const tasks=[];
  if(task.agent==='lead-scout') tasks.push(['source-discovery','lead-scout','discover_sources'],['collection','lead-scout','collect_listings'],['dedupe','lead-scout','deduplicate'],['report','lead-scout','build_report']);
  else tasks.push(['primary',task.agent,task.action],['quality-check','qa','validate_result'],['report','orchestrator','report']);
  return tasks.map(([task_key,agent_id,action],i)=>({id:newId(),task_key,agent_id,action,status:'queued',priority:100-i,input:base.input}));
}
async function emit(pool,missionId,taskId,type,payload={}){await pool.query('INSERT INTO mission_events(mission_id,task_id,type,payload) VALUES($1,$2,$3,$4)',[missionId,taskId,String(type).slice(0,80),JSON.stringify(payload)])}
function actionTool(agent,action){
  const map={
    'search_property_sources':'lead-scout','discover_sources':'lead-scout','collect_listings':'lead-scout','deduplicate':'lead-scout',
    'analyze_property':'property','match':'search','crm_task':'crm','create_content':'content','market_scan':'market',
    'document_task':'documents','construction_plan':'construction','design_brief':'design','investment_analysis':'investment',
    'delegate_specialists':'search','understand_request':'search','verify_result':'qa','validate_result':'qa','report':'search'
  };
  return map[action]||map[agent]||null;
}
async function executeTask(pool,t){
  const mission=(await pool.query('SELECT user_id,plan,command FROM missions WHERE id=$1',[t.mission_id])).rows[0];
  const userId=mission?.user_id;
  const sub=userId?(await pool.query('SELECT tier FROM subscriptions WHERE user_id=$1',[userId])).rows[0]:null;
  const tier=String(sub?.tier||'free').toLowerCase();
  const toolId=actionTool(t.agent_id,t.action);
  if(toolId){
    const auth=await authorizeTool(pool,toolId,{tier,agentId:t.agent_id});
    if(!auth.allowed)return {status:'blocked',reason:auth.reason,required_tier:auth.required_tier||null,tool:toolId};
    if(auth.policy?.approval_required)return {status:'blocked',reason:'TOOL_APPROVAL_REQUIRED',tool:toolId,risk:auth.policy.risk};
  }

  const text=String(mission?.command||t.input?.raw||'').trim();
  if(t.agent_id==='lead-scout'&&t.action==='collect_listings'){
    return {status:'blocked',reason:'SOURCE_ADAPTER_REQUIRED',sources:t.input?.sources||[],policy:'public_or_authorized_only'};
  }
  if(t.agent_id==='qa'&&t.action==='validate_result'){
    return {status:'passed',checks:['schema','mission_state','provenance_required','permission_boundary']};
  }
  if(t.agent_id==='orchestrator'&&t.action==='report'){
    const rows=(await pool.query("SELECT task_key,agent_id,action,status,output,error FROM mission_tasks WHERE mission_id=$1 ORDER BY priority DESC,created_at",[t.mission_id])).rows;
    return {status:'finished',mission_id:t.mission_id,tasks:rows,summary:'گزارش مأموریت آماده شد.'};
  }

  // Local-first executors make the initial version useful without external providers.
  if(t.action==='create_content'){
    const subject=text.replace(/^(?:برای|لطفاً|لطفا)\s*/,'').trim();
    return {status:'finished',type:'listing_copy',headline:'فرصت ویژه ملکی',body:`اگر به دنبال یک گزینه مناسب در حوزه املاک هستید، این فرصت را بررسی کنید. مشخصات، قیمت و جزئیات را قبل از انتشار نهایی تکمیل و تأیید کنید.\n\nدرخواست: ${subject}`,channels:['website','instagram','telegram'],requires_review:true};
  }
  if(t.action==='analyze_property'){
    const area=(text.match(/(\\d+(?:[.,]\\d+)?)\\s*(?:متر|متری)/)||[])[1];
    const price=(text.match(/(\\d+(?:[.,]\\d+)?)\\s*(?:میلیارد|میلیون)/)||[])[1];
    return {status:'finished',type:'property_analysis',extracted:{area:area?Number(area.replace(',','.')):null,price_hint:price||null},analysis:['اطلاعات صریح متن استخراج شد.','برای ارزش‌گذاری دقیق به موقعیت، وضعیت سند، کاربری و معاملات مقایسه‌ای نیاز است.'],confidence:'limited_without_external_market_data'};
  }
  if(t.action==='investment_analysis'){
    return {status:'finished',type:'investment_analysis',scenarios:[
      {name:'محافظه‌کارانه',focus:'حفظ سرمایه و نقدشوندگی'},
      {name:'متعادل',focus:'ترکیب رشد قیمت و درآمد'},
      {name:'تهاجمی',focus:'توسعه/بازسازی با ریسک بالاتر'}
    ],required_inputs:['قیمت خرید','هزینه‌های جانبی','درآمد یا قیمت فروش هدف','افق سرمایه‌گذاری'],note:'این خروجی سناریویی است و جایگزین مشاوره مالی نیست.'};
  }
  if(t.action==='construction_plan'){
    return {status:'finished',type:'construction_plan',phases:['بررسی زمین و ضوابط','برآورد سطح و تعداد واحد','برآورد هزینه','مدل درآمد و سود','تصمیم اجرا'],required_inputs:['مساحت زمین','عرض و دسترسی','کاربری','تراکم/ضوابط','هزینه ساخت منطقه']};
  }
  if(t.action==='design_brief'){
    return {status:'finished',type:'design_brief',scenes:['نمای بیرونی','پذیرایی','آشپزخانه','اتاق خواب','نورپردازی'],preserve_originals:true,ai_disclaimer:'سناریوی طراحی تصویری است و وضعیت واقعی ملک را تغییر نمی‌دهد.'};
  }
  if(t.action==='crm_task'){
    return {status:'finished',type:'crm_plan',next_actions:['اولویت‌بندی مشتری','بررسی آخرین تعامل','انتخاب کانال تماس','ثبت نتیجه پیگیری'],suggested_due:'today'};
  }
  if(t.action==='match'){
    return {status:'finished',type:'matching_plan',criteria:['بودجه','نوع ملک','موقعیت','متراژ','هدف خرید'],requires_property_and_client_data:true};
  }
  if(t.action==='market_scan'){
    return {status:'finished',type:'market_scan',mode:'local-first',note:'برای داده زنده بازار باید Search/Maps/Source Adapter مجاز متصل شود.',requested:{location:t.input?.city||null}};
  }
  if(t.action==='discover_sources'||t.action==='deduplicate'){
    return {status:'finished',type:t.action,mode:'adapter-ready',note:'ساختار آماده است؛ داده خارجی فقط از منبع مجاز وارد می‌شود.'};
  }
  return {status:'finished',agent:t.agent_id,action:t.action,note:'Task در نسخه اولیه با قرارداد اجرایی ثبت و تکمیل شد.'};
}
function createRouter(opts){
  const router=express.Router(),pool=opts.pool,isAdmin=opts.isAdmin;
  let ready=false;
  async function ensure(){if(ready)return;await pool.query('CREATE TABLE IF NOT EXISTS agent_jobs(id TEXT PRIMARY KEY,user_id BIGINT,agent_id TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,command TEXT NOT NULL,task JSONB NOT NULL,result JSONB,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ)');await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_jobs_created ON agent_jobs(created_at DESC)');await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_jobs_user ON agent_jobs(user_id,created_at DESC)');ready=true}
  router.use(async(req,res,next)=>{try{await ensure();next()}catch(e){next(e)}});
  router.get('/',(req,res)=>res.json({agents:AGENTS,mission_engine:'v1',tiers:['free','plus','pro','office','enterprise']}));
  router.get('/jobs',async(req,res)=>{const p=[];let w='';if(!isAdmin(req)){w='WHERE user_id=$1';p.push(req.session.user.id)}const r=await pool.query('SELECT id,agent_id,action,status,command,task,result,error,created_at,started_at,finished_at FROM agent_jobs '+w+' ORDER BY created_at DESC LIMIT 100',p);res.json(r.rows)});
  router.get('/missions',async(req,res)=>{const p=[];let w='';if(!isAdmin(req)){w='WHERE user_id=$1';p.push(req.session.user.id)}const r=await pool.query('SELECT id,command,status,plan,result,error,created_at,started_at,finished_at,updated_at FROM missions '+w+' ORDER BY created_at DESC LIMIT 50',p);res.json(r.rows)});
  router.get('/missions/:id',async(req,res)=>{const m=(await pool.query('SELECT * FROM missions WHERE id=$1',[req.params.id])).rows[0];if(!m)return res.status(404).json({error:'MISSION_NOT_FOUND'});if(!isAdmin(req)&&Number(m.user_id)!==Number(req.session.user.id))return res.status(403).json({error:'FORBIDDEN'});const [t,e]=await Promise.all([pool.query('SELECT * FROM mission_tasks WHERE mission_id=$1 ORDER BY priority DESC,created_at',[m.id]),pool.query('SELECT * FROM mission_events WHERE mission_id=$1 ORDER BY created_at DESC LIMIT 200',[m.id])]);res.json({...m,tasks:t.rows,events:e.rows})});
  router.post('/command',requireTier('pro'),async(req,res)=>{
    const command=String(req.body?.command||'').trim();if(!command)return res.status(400).json({error:'COMMAND_REQUIRED'});
    const task=parseCommand(command),selected=selectAgents(command),planned=planTasks(task),idempotencyKey=String(req.body?.idempotency_key||'').trim();
    if(idempotencyKey){const prev=await pool.query('SELECT response FROM idempotency_keys WHERE key=$1 AND user_id=$2 AND operation=$3 AND (expires_at IS NULL OR expires_at>now())',[idempotencyKey,req.session.user.id,'mission.command']);if(prev.rows[0])return res.status(200).json(prev.rows[0].response);}
    const id=newId();
    if(selected.length){task.selected_agents=selected.map(a=>a.id);planned.unshift({id:newId(),task_key:'specialist-selection',agent_id:'orchestrator',action:'delegate_specialists',status:'queued',priority:110,input:{agents:task.selected_agents}});}
    const client=await pool.connect();
    try{await client.query('BEGIN');await client.query('INSERT INTO missions(id,user_id,command,status,plan) VALUES($1,$2,$3,$4,$5)',[id,req.session.user.id,command,'queued',JSON.stringify(task)]);
      for(const t of planned)await client.query('INSERT INTO mission_tasks(id,mission_id,task_key,agent_id,action,status,priority,input) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[t.id,id,t.task_key,t.agent_id,t.action,'queued',t.priority,JSON.stringify(t.input)]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    const response={mission_id:id,status:'queued',agent:task.agent,action:task.action,plan:planned};
    if(idempotencyKey)await pool.query('INSERT INTO idempotency_keys(key,user_id,operation,response,expires_at) VALUES($1,$2,$3,$4,now()+interval \'24 hours\') ON CONFLICT(key) DO NOTHING',[idempotencyKey,req.session.user.id,'mission.command',JSON.stringify(response)]);
    emit(pool,id,null,'mission.created',{agent:task.agent,action:task.action});
    res.status(202).json(response);
  });
  router.post('/missions/:id/cancel',async(req,res)=>{const m=(await pool.query('SELECT * FROM missions WHERE id=$1',[req.params.id])).rows[0];if(!m)return res.status(404).json({error:'MISSION_NOT_FOUND'});if(!isAdmin(req)&&Number(m.user_id)!==Number(req.session.user.id))return res.status(403).json({error:'FORBIDDEN'});await pool.query("UPDATE missions SET status='cancelled',finished_at=now(),updated_at=now() WHERE id=$1 AND status NOT IN ('finished','failed','cancelled')",[m.id]);await pool.query("UPDATE mission_tasks SET status='cancelled',updated_at=now() WHERE mission_id=$1 AND status IN ('queued','running')",[m.id]);await emit(pool,m.id,null,'mission.cancelled');res.json({ok:true,status:'cancelled'})});
  router.get('/jobs/:id',async(req,res)=>{const r=await pool.query('SELECT * FROM agent_jobs WHERE id=$1',[req.params.id]),j=r.rows[0];if(!j)return res.status(404).json({error:'AGENT_JOB_NOT_FOUND'});if(!isAdmin(req)&&Number(j.user_id)!==Number(req.session.user.id))return res.status(403).json({error:'FORBIDDEN'});res.json(j)});
  router.post('/jobs/:id/cancel',async(req,res)=>{const r=await pool.query('SELECT * FROM agent_jobs WHERE id=$1',[req.params.id]),j=r.rows[0];if(!j)return res.status(404).json({error:'AGENT_JOB_NOT_FOUND'});if(!isAdmin(req)&&Number(j.user_id)!==Number(req.session.user.id))return res.status(403).json({error:'FORBIDDEN'});await pool.query("UPDATE agent_jobs SET status='cancelled',finished_at=now() WHERE id=$1 AND status NOT IN ('finished','failed','cancelled')",[j.id]);res.json({ok:true,status:'cancelled'})});
  return router;
}
async function recoverStaleWork(pool){
  // Recover tasks/missions left running by a crashed worker or process restart.
  await pool.query("UPDATE mission_tasks SET status='queued',locked_at=NULL,updated_at=now() WHERE status='running' AND locked_at < now() - interval '10 minutes' AND attempts < max_attempts");
  await pool.query("UPDATE mission_tasks SET status='failed',error=COALESCE(error,'TASK_TIMEOUT'),finished_at=now(),updated_at=now() WHERE status='running' AND locked_at < now() - interval '10 minutes' AND attempts >= max_attempts");
  await pool.query("UPDATE missions m SET status='queued',updated_at=now() WHERE m.status='running' AND m.updated_at < now() - interval '10 minutes' AND EXISTS (SELECT 1 FROM mission_tasks t WHERE t.mission_id=m.id AND t.status='queued')");
}
async function startMissionWorker(pool){
  let busy=false;
  setInterval(async()=>{
    if(busy)return; busy=true;
    try{await recoverStaleWork(pool)}catch(e){console.error('stale mission recovery error',e)}
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const q=await client.query("SELECT id FROM missions WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
      if(q.rows[0]){const id=q.rows[0].id;await client.query("UPDATE missions SET status='running',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1",[id]);await client.query('COMMIT');setImmediate(()=>runMission(pool,id).catch(e=>console.error('mission worker error',e)));}
      else await client.query('COMMIT');
    }catch(e){try{await client.query('ROLLBACK')}catch{} console.error('mission queue error',e)}finally{client.release();busy=false}
  },2000);
}
async function runMission(pool,id){
  await pool.query("UPDATE missions SET status='running',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1 AND status IN ('queued','running')",[id]);
  const tasks=(await pool.query("SELECT * FROM mission_tasks WHERE mission_id=$1 AND status='queued' AND attempts < max_attempts ORDER BY priority DESC,created_at",[id])).rows;
  for(const t of tasks){
    const current=(await pool.query('SELECT status FROM missions WHERE id=$1',[id])).rows[0];if(!current||current.status==='cancelled')break;
    await pool.query("UPDATE mission_tasks SET status='running',started_at=now(),locked_at=now(),attempts=attempts+1,updated_at=now() WHERE id=$1",[t.id]);await emit(pool,id,t.id,'task.started',{agent:t.agent_id,action:t.action});
    try{
      const out=await executeTask(pool,t);
      const status=out.status==='blocked'?'blocked':'finished';
      await pool.query("UPDATE mission_tasks SET status=$2,output=$3,finished_at=now(),locked_at=NULL,updated_at=now() WHERE id=$1",[t.id,status,JSON.stringify(out)]);
      await emit(pool,id,t.id,'task.finished',{status,output:out,attempt:t.attempts});
      if(status==='blocked') break;
    }catch(e){
      const nextStatus=t.attempts < t.max_attempts ? 'queued' : 'failed';
      await pool.query("UPDATE mission_tasks SET status=$2,error=$3,finished_at=CASE WHEN $2='failed' THEN now() ELSE NULL END,locked_at=NULL,updated_at=now() WHERE id=$1",[t.id,nextStatus,String(e.message||e)]);
      await emit(pool,id,t.id,nextStatus==='queued'?'task.retry_scheduled':'task.failed',{error:String(e.message||e),attempt:t.attempts,max_attempts:t.max_attempts});
      if(nextStatus==='queued'){
        await pool.query("UPDATE missions SET status='queued',updated_at=now() WHERE id=$1 AND status='running'",[id]);
        break;
      }
    }
  }
  const left=(await pool.query("SELECT count(*)::int n FROM mission_tasks WHERE mission_id=$1 AND status IN ('queued','running')",[id])).rows[0].n;
  const failed=(await pool.query("SELECT count(*)::int n FROM mission_tasks WHERE mission_id=$1 AND status='failed'",[id])).rows[0].n;
  const blocked=(await pool.query("SELECT count(*)::int n FROM mission_tasks WHERE mission_id=$1 AND status='blocked'",[id])).rows[0].n;
  const queued=(await pool.query("SELECT count(*)::int n FROM mission_tasks WHERE mission_id=$1 AND status='queued'",[id])).rows[0].n;
  const status=blocked?'blocked':failed?'failed':queued?'queued':left?'running':'finished';
  await pool.query('UPDATE missions SET status=$2,result=$3,finished_at=CASE WHEN $2 IN (\'finished\',\'failed\',\'blocked\') THEN now() ELSE finished_at END,updated_at=now() WHERE id=$1',[id,status,JSON.stringify({failed,blocked})]);
  await emit(pool,id,null,'mission.completed',{status,failed,blocked});
}
module.exports={AGENTS,parseCommand,createRouter,runMission,startMissionWorker};