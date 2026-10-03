const express=require('express');
const {requireTier,userTier}=require('./foundation');
const {selectAgents}=require('./agent-registry');
function createGuideRouter(){
 const r=express.Router();
 r.get('/profile',(req,res)=>res.json({tier:userTier(req.session?.user),role:req.session?.user?.role||'consumer',mode:'goal-oriented-real-estate-copilot'}));
 r.post('/plan',requireTier('plus'),(req,res)=>{
   const goal=String(req.body?.goal||'').trim();
   if(!goal)return res.status(400).json({error:'GOAL_REQUIRED'});
   const agents=selectAgents(goal);
   res.json({goal,agents:agents.map(a=>a.id),steps:['understand_goal','collect_context','delegate_specialists','verify','next_best_action'],human_approval_for:['external_write','payment','contract','publish','delete']});
 });
 return r;
}
module.exports={createGuideRouter};