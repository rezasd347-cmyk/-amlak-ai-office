const {AGENTS}=require('./agent-catalog');

const BUILTIN=AGENTS.map(a=>({...a,enabled:true}));
function listAgents(){return BUILTIN.map(a=>({...a}));}
function getAgent(id){return BUILTIN.find(a=>a.id===id)||null;}
function selectAgents(command){
 const t=String(command||'').toLowerCase();
 const out=[];
 const rules=[
  ['owner-omni',/مالک|مدیر|دستیار اجرایی|بررسی کن چرا|چرا .*کار نمی‌کند|چرا .*کار نمیکنه/],
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
  ['qa',/تست|باگ|عیب|سلامت|کیفیت|گیتهاب|github/],
  ['research',/تحقیق|پژوهش|بررسی عمیق|منبع|ریسرچ/],
  ['competitor',/رقیب|رقبا|بنچمارک|مقایسه رقبا/],
  ['product',/محصول|roadmap|رودمپ|ویژگی جدید|feature/],
  ['ux',/تجربه کاربر|UX|رابط|کاربری|usability/],
  ['architecture',/معماری|مقیاس|اسکیل|زیرساخت|backend|frontend/],
  ['security',/امنیت|آسیب‌پذیری|دسترسی|احراز/],
  ['business',/کسب‌وکار|رشد|KPI|درآمد|اقتصاد/]
 ];
 for(const [id,re] of rules) if(re.test(t)) out.push(id);
 if(!out.length) out.push('orchestrator');
 return [...new Set(out)].map(getAgent).filter(Boolean);
}
module.exports={BUILTIN,listAgents,getAgent,selectAgents};