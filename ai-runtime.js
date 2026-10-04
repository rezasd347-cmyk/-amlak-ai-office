const DEFAULT_BASE='https://api.openai.com/v1';
function configured(){return !!process.env.AI_API_KEY;}
function base(){return String(process.env.AI_BASE_URL||DEFAULT_BASE).replace(/\/$/,'');}
function model(){return String(process.env.AI_MODEL||'gpt-5-mini');}
async function runAI({instruction,input,structured=false}){
 if(!configured()) return {status:'unavailable',reason:'AI_PROVIDER_NOT_CONFIGURED'};
 const body={model:model(),input:[{role:'system',content:[{type:'input_text',text:String(instruction)}]},{role:'user',content:[{type:'input_text',text:typeof input==='string'?input:JSON.stringify(input)}]}]};
 if(structured) body.text={format:{type:'json_object'}};
 const r=await fetch(base()+'/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.AI_API_KEY},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)return {status:'error',http_status:r.status,error:data?.error?.message||'AI_PROVIDER_ERROR'};
 const text=data.output_text||((data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').filter(Boolean).join('\n'));
 if(structured){try{return {status:'completed',data:JSON.parse(text),response_id:data.id}}catch{return {status:'completed',text,response_id:data.id}}}
 return {status:'completed',text,response_id:data.id};
}
module.exports={configured,runAI};