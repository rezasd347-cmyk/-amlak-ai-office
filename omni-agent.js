const express=require('express');
const {requireTier,userTier,newId}=require('./foundation');
const {selectTools,listTools}=require('./tool-registry');
const {selectAgents}=require('./agent-registry');

function owner(req){return req.session?.user?.role==='admin';}

function plan(command){
  const tools=selectTools(command);
  const text=String(command||'');
  const writeRisk=/حذف|پاک|تغییر|انتشار|ارسال|پرداخت|خرید|فروش|قرارداد|deploy|deploy/i.test(text);
  return {
    intent:text,
    tools:tools.map(t=>t.id),
    steps:[
      {key:'understand',action:'understand_request'},
      ...tools.map((t,i)=>({key:'tool_'+i,action:t.id})),
      {key:'verify',action:'verify_result'},
      {key:'report',action:'report'}
    ],
    approval_required:writeRisk
  };
}

function createOmniRouter({pool}){
  const router=express.Router();

  router.get('/profile',(req,res)=>res.json({
    owner_mode:owner(req),
    tier:userTier(req.session?.user),
    role:req.session?.user?.role||'guest',
    mission_model:'mission-plan-execute-verify-report'
  }));

  router.get('/tools',requireTier('pro'),(req,res)=>res.json({tools:listTools()}));

  router.post('/command',requireTier('pro'),async(req,res,next)=>{
    try{
      const command=String(req.body?.command||'').trim();
      if(!command)return res.status(400).json({error:'COMMAND_REQUIRED'});
      const p=plan(command);
      p.agents=selectAgents(command).map(a=>a.id);
      const missionId=newId();
      await pool.query(
        'INSERT INTO missions(id,user_id,command,status,plan) VALUES($1,$2,$3,$4,$5)',
        [missionId,req.session.user.id,command,p.approval_required?'blocked':'queued',JSON.stringify({...p,owner_mode:owner(req)})]
      );
      for(let i=0;i<p.steps.length;i++){
        const s=p.steps[i];
        await pool.query(
          'INSERT INTO mission_tasks(id,mission_id,task_key,agent_id,action,status,priority,input) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [newId(),missionId,s.key,s.action==='report'?'orchestrator':(s.action==='verify'?'qa':s.action),s.action,'queued',100-i,JSON.stringify({command})]
        );
      }
      if(p.approval_required){
        await pool.query(
          'INSERT INTO approvals(id,user_id,mission_id,kind,status,payload) VALUES($1,$2,$3,$4,$5,$6)',
          [newId(),req.session.user.id,missionId,'owner_sensitive_action','pending',JSON.stringify({command,reason:'Sensitive action requires owner approval'})]
        );
      }
      res.status(202).json({mission_id:missionId,status:'queued',plan:p});
    }catch(e){next(e);}
  });

  router.get('/approvals',adminOnly,async(req,res,next)=>{
    try{
      const r=await pool.query('SELECT * FROM approvals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.session.user.id]);
      res.json(r.rows);
    }catch(e){next(e);}
  });

  router.post('/approvals/:id/decision',adminOnly,async(req,res,next)=>{
    try{
      const decision=req.body?.decision;
      if(!['approved','rejected'].includes(decision))return res.status(400).json({error:'INVALID_DECISION'});
      const r=await pool.query(
        'UPDATE approvals SET status=$2,decision=$3,decided_at=now() WHERE id=$1 AND user_id=$4 AND status=\'pending\' RETURNING *',
        [req.params.id,decision,JSON.stringify({by:req.session.user.id,decision}),req.session.user.id]
      );
      if(!r.rows[0])return res.status(404).json({error:'APPROVAL_NOT_FOUND'});
      if(r.rows[0].mission_id){
        await pool.query(decision==='approved' ? "UPDATE missions SET status='queued',updated_at=now() WHERE id=$1 AND status='blocked'" : "UPDATE missions SET status='cancelled',finished_at=now(),updated_at=now() WHERE id=$1 AND status='blocked'",[r.rows[0].mission_id]);
      }
      res.json(r.rows[0]);
    }catch(e){next(e);}
  });

  return router;
}

function adminOnly(req,res,next){
  if(req.session?.user?.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'});
  next();
}

module.exports={createOmniRouter,plan};
