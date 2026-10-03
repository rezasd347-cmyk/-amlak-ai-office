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
function selectTools(command){
  const text=String(command||'').toLowerCase();
  const hits=[];
  for(const t of BUILTIN_TOOLS){
    if(text.includes(t.id) || text.includes(t.name.toLowerCase()) || text.includes(t.capability.replaceAll('_',' '))) hits.push(t.id);
  }
  if(/ملک|آگهی|خونه|خانه|زمین/.test(text)) hits.push('search','property');
  if(/بازار|قیمت|رشد/.test(text)) hits.push('market');
  if(/مشتری|پیگیری|crm/.test(text)) hits.push('crm');
  if(/کد|باگ|تست|github|گیت/.test(text)) hits.push('code','qa');
  return [...new Set(hits)].map(getTool).filter(Boolean);
}

module.exports={BUILTIN_TOOLS,listTools,getTool,selectTools};
