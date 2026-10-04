const crypto=require('crypto');
const {SERVICES}=require('./service-catalog');

const TIERS={FREE:'free',PLUS:'plus',PRO:'pro',OFFICE:'office',ENTERPRISE:'enterprise'};
const TIER_RANK={free:0,plus:1,pro:2,office:3,enterprise:4};

async function ensureFoundation(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS subscriptions(
    user_id BIGINT PRIMARY KEY,
    tier TEXT NOT NULL DEFAULT 'free',
    account_type TEXT NOT NULL DEFAULT 'consumer',
    status TEXT NOT NULL DEFAULT 'active',
    provider TEXT,
    external_id TEXT,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'consumer'");
  await pool.query(`CREATE TABLE IF NOT EXISTS missions(
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS mission_tasks(
    id UUID PRIMARY KEY,
    mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES mission_tasks(id) ON DELETE SET NULL,
    task_key TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    priority INTEGER NOT NULL DEFAULT 50,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    locked_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(mission_id,task_key)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS mission_events(
    id BIGSERIAL PRIMARY KEY,
    mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    task_id UUID REFERENCES mission_tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS source_adapters(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_missions_user_created ON missions(user_id,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status,updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tasks_queue ON mission_tasks(status,priority DESC,created_at ASC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tasks_mission ON mission_tasks(mission_id,created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_events_mission ON mission_events(mission_id,created_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS media_assets(
    id UUID PRIMARY KEY,property_id BIGINT NOT NULL,user_id BIGINT,source_media_id TEXT,kind TEXT NOT NULL,
    original_url TEXT,processed_url TEXT,thumbnail_url TEXT,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,status TEXT NOT NULL DEFAULT 'ready',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS media_jobs(
    id UUID PRIMARY KEY,property_id BIGINT NOT NULL,user_id BIGINT,media_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    job_type TEXT NOT NULL,params JSONB NOT NULL DEFAULT '{}'::jsonb,status TEXT NOT NULL DEFAULT 'queued',
    result JSONB,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS virtual_tours(
    id UUID PRIMARY KEY,property_id BIGINT NOT NULL,user_id BIGINT,name TEXT NOT NULL DEFAULT 'تور مجازی',
    engine TEXT NOT NULL DEFAULT 'internal',status TEXT NOT NULL DEFAULT 'draft',cover_media_id TEXT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,result JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS design_scenarios(
    id UUID PRIMARY KEY,property_id BIGINT NOT NULL,user_id BIGINT,name TEXT NOT NULL,
    source_media_id TEXT,room_type TEXT,style TEXT,materials JSONB NOT NULL DEFAULT '{}'::jsonb,
    prompt TEXT,disclaimer TEXT NOT NULL DEFAULT 'تصویرسازی AI است و وضعیت واقعی ملک را تغییر نمی‌دهد.',
    status TEXT NOT NULL DEFAULT 'draft',result JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS service_catalog(
    id TEXT PRIMARY KEY,name TEXT NOT NULL,required_tier TEXT NOT NULL DEFAULT 'free',enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tools_registry(
    id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT true,
    required_tier TEXT NOT NULL DEFAULT 'pro',config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS feature_flags(
    key TEXT PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT false,config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_policies(
    agent_id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT true,
    required_tier TEXT NOT NULL DEFAULT 'free',
    allowed_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    blocked_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    auto_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    approval_risk TEXT NOT NULL DEFAULT 'high',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tool_policies(
    tool_id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT true,
    required_tier TEXT NOT NULL DEFAULT 'free',
    risk TEXT NOT NULL DEFAULT 'low',
    approval_required BOOLEAN NOT NULL DEFAULT false,
    allowed_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  `);
    await pool.query(`CREATE TABLE IF NOT EXISTS approvals(
    id UUID PRIMARY KEY,user_id BIGINT NOT NULL,mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
    task_id UUID REFERENCES mission_tasks(id) ON DELETE CASCADE,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,decision JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    actor_type TEXT NOT NULL DEFAULT 'user',
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    request_id TEXT,
    risk TEXT NOT NULL DEFAULT 'low',
    status TEXT NOT NULL DEFAULT 'success',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type,resource_id,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_risk ON audit_logs(risk,created_at DESC)');
    await pool.query(`CREATE TABLE IF NOT EXISTS ai_runs(
    id UUID PRIMARY KEY,mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,task_id UUID REFERENCES mission_tasks(id) ON DELETE SET NULL,
    provider TEXT,model TEXT,request JSONB,result JSONB,status TEXT NOT NULL,latency_ms INTEGER,tokens_in INTEGER,tokens_out INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS idempotency_keys(
    key TEXT PRIMARY KEY,user_id BIGINT NOT NULL,operation TEXT NOT NULL,response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS outbox_events(
    id BIGSERIAL PRIMARY KEY,event_type TEXT NOT NULL,payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),processed_at TIMESTAMPTZ)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status,created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_runs_mission ON ai_runs(mission_id,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status,available_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_idempotency_user_operation ON idempotency_keys(user_id,operation,created_at DESC)');
  for(const x of [
    ['orchestrator','free'],['lead-scout','pro'],['property-intel','pro'],['matching','pro'],['crm','pro'],['content','pro'],
    ['market','pro'],['document','pro'],['construction','pro'],['design','pro'],['investment','pro'],['qa','pro'],
    ['research','office'],['competitor','office'],['product','office'],['ux','office'],['architecture','office'],['security','office'],['business','office']
  ]) await pool.query('INSERT INTO agent_policies(agent_id,required_tier) VALUES($1,$2) ON CONFLICT(agent_id) DO UPDATE SET required_tier=EXCLUDED.required_tier,updated_at=now()',[x[0],x[1]]);
  for(const x of [
    ['public-web','Public web adapter','source','pro'],
    ['divar','Divar connector placeholder','source','pro'],
    ['sheypoor','Sheypoor connector placeholder','source','pro'],
    ['meta-public','Meta public API connector placeholder','source','pro'],
    ['maps','Maps/location provider','location','free'],
    ['ai-provider','AI model gateway','ai','pro']
  ]) await pool.query('INSERT INTO tools_registry(id,name,kind,required_tier) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',x);
  for(const x of [
    ['mission_engine',true],['pro_command_center',true],['lead_scout',false],['ai_self_healing',false]
  ]) await pool.query('INSERT INTO feature_flags(key,enabled) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',x);
  for(const x of [
    ['billing',true,'critical'],['mcp',true,'high'],['code',true,'high'],['qa',true,'low'],['documents',false,'high']
  ]) await pool.query('INSERT INTO tool_policies(tool_id,enabled,approval_required,risk) VALUES($1,$2,$3,$4) ON CONFLICT(tool_id) DO NOTHING',[x[0],x[1],x[2]==='critical'||x[2]==='high',x[2]]);
    for(const x of SERVICES) await pool.query('INSERT INTO service_catalog(id,name,required_tier) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,required_tier=EXCLUDED.required_tier,updated_at=now()',[x.id,x.title,x.tier]);



}

function tierRank(tier){return TIER_RANK[String(tier||'free').toLowerCase()]??0;}
function hasTier(tier,required='pro'){return tierRank(tier)>=tierRank(required);}
function userTier(user){if(!user)return 'free';if(user.role==='admin')return 'enterprise';return String(user.subscription_tier||'free').toLowerCase();}
function requireTier(required='pro'){
  return (req,res,next)=>{
    const tier=userTier(req.session?.user);
    if(!hasTier(tier,required))return res.status(402).json({error:'PRO_REQUIRED',required_tier:required,current_tier:tier});
    next();
  };
}
function newId(){return crypto.randomUUID();}
function eventType(type){return String(type||'event').slice(0,80);}
module.exports={TIERS,TIER_RANK,ensureFoundation,tierRank,hasTier,userTier,requireTier,newId,eventType};
