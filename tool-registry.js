const BUILTIN_TOOLS = [
  { id:'property', name:'Property', capability:'property_management', tier:'free', risk:'low' },
  { id:'crm', name:'CRM', capability:'crm', tier:'pro', risk:'medium' },
  { id:'search', name:'Search', capability:'property_search', tier:'free', risk:'low' },
  { id:'market', name:'Market Intelligence', capability:'market_analysis', tier:'pro', risk:'low' },
  { id:'lead-scout', name:'Lead Scout', capability:'public_lead_discovery', tier:'pro', risk:'medium' },
  { id:'content', name:'Content Studio', capability:'content_generation', tier:'pro', risk:'low' },
  { id:'media', name:'Media Studio', capability:'media_processing', tier:'plus', risk:'medium' },
  { id:'documents', name:'Documents', capability:'document_analysis', tier:'pro', risk:'high' },
  { id:'construction', name:'Construction', capability:'construction_analysis', tier:'pro', risk:'medium' },
  { id:'design', name:'Design Studio', capability:'design_scenarios', tier:'pro', risk:'medium' },
  { id:'investment', name:'Investment', capability:'investment_analysis', tier:'pro', risk:'medium' },
  { id:'web', name:'Public Web', capability:'public_web', tier:'pro', risk:'medium' },
  { id:'mcp', name:'MCP Connectors', capability:'external_connectors', tier:'office', risk:'high' },
  { id:'code', name:'Code', capability:'code_analysis', tier:'office', risk:'high' },
  { id:'qa', name:'QA', capability:'quality_assurance', tier:'office', risk:'high' },
  { id:'billing', name:'Billing', capability:'billing', tier:'office', risk:'critical' }
];

function listTools(){ return BUILTIN_TOOLS.map(x=>({...x})); }
function getTool(id){ return BUILTIN_TOOLS.find(x=>x.id===id) || null; }
function selectTools(command,{tier='free',agentId=null}={}){
  const text=String(command||'').toLowerCase();
  const hits=[];
  for(const t of BUILTIN_TOOLS){
    if(text.includes(t.id) || text.includes(t.name.toLowerCase()) || text.includes(t.capability.replaceAll('_',' '))) hits.push(t.id);
  }
  if(/ملک|آگهی|خونه|خانه|زمین/.test(text)) hits.push('search','property');
  if(/بازار|قیمت|رشد/.test(text)) hits.push('market');
  if(/مشتری|پیگیری|crm/.test(text)) hits.push('crm');
  if(/کد|باگ|تست|github|گیت/.test(text)) hits.push('code','qa');
  return [...new Set(hits)].map(getTool).filter(Boolean).filter(t=>tierRank(tier)>=tierRank(t.tier)).filter(t=>!agentId || !TOOL_AGENT_DENY[agentId]?.includes(t.id));
}

const TIER_RANK={free:0,plus:1,pro:2,office:3,enterprise:4};
const tierRank=t=>TIER_RANK[String(t||'free').toLowerCase()]??0;
const TOOL_AGENT_DENY={};

async function authorizeTool(pool,toolId,{tier='free',agentId=null}={}){
  const tool=getTool(toolId);
  if(!tool)return {allowed:false,reason:'TOOL_NOT_FOUND'};
  if(tierRank(tier)<tierRank(tool.tier))return {allowed:false,reason:'TIER_REQUIRED',required_tier:tool.tier};
  if(agentId&&TOOL_AGENT_DENY[agentId]?.includes(tool.id))return {allowed:false,reason:'AGENT_TOOL_DENIED'};
  if(!pool)return {allowed:true,tool};
  const r=await pool.query('SELECT enabled,required_tier,risk,approval_required,allowed_agents,config FROM tool_policies WHERE tool_id=$1',[tool.id]);
  if(!r.rows[0])return {allowed:true,tool};
  const p=r.rows[0];
  if(!p.enabled)return {allowed:false,reason:'TOOL_DISABLED'};
  if(tierRank(tier)<tierRank(p.required_tier))return {allowed:false,reason:'POLICY_TIER_REQUIRED',required_tier:p.required_tier};
  const allowed=Array.isArray(p.allowed_agents)?p.allowed_agents:(Array.isArray(p.allowed_agents?.value)?p.allowed_agents.value:[]);
  if(allowed.length&&agentId&&!allowed.includes(agentId))return {allowed:false,reason:'AGENT_NOT_ALLOWED'};
  return {allowed:true,tool,policy:{risk:p.risk,approval_required:p.approval_required,config:p.config||{}}};
}

module.exports={BUILTIN_TOOLS,listTools,getTool,selectTools,tierRank,authorizeTool};
