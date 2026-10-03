const {AGENTS}=require('./agent-catalog');
const BUILTIN=AGENTS.map(a=>({...a,required_tier:a.id==='orchestrator'?'free':'pro',risk:a.id==='qa'?'high':'medium',enabled:true}));
function listAgents(){return BUILTIN.map(a=>({...a}));}
function getAgent(id){return BUILTIN.find(a=>a.id===id)||null;}
function selectAgents(command){
 const t=String(command||'').toLowerCase();
 const out=[];
 const rules=[
  ['lead-scout',/آگهی|لید|سرنخ|دیوار|شیپور/],
  ['property-intel',/قیمت|ارزش|تحلیل ملک|مقایسه/],
  ['matching',/مچ|مطابقت|مناسب/],
  ['crm',/مشتری|پیگیری|فالو|تماس/],
  ['content',/متن آگهی|کپشن|ریلز|اینستاگرام/],
  ['market',/بازار|محله|منطقه|روند قیمت/],
  ['document',/سند|مدرک|مجوز|قرارداد/],
  ['construction',/ساخت|طبقه|واحد|هزینه ساخت/],
  ['design',/طراحی|نما|پلان|بازسازی|دکور/],
  ['investment',/سرمایه گذاری|سرمایه‌گذاری|ROI|سود|بازده/],
  ['qa',/تست|باگ|عیب|سلامت|کیفیت|گیتهاب|github/]
 ];
 for(const [id,re] of rules) if(re.test(t)) out.push(id);
 return [...new Set(out)].map(getAgent).filter(Boolean);
}
module.exports={BUILTIN:BUILTIN,listAgents,getAgent,selectAgents};