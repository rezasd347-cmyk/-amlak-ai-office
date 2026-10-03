const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const pkg=require('../package.json');

test('package has production start and required dependencies',()=>{
  assert.equal(pkg.scripts.start,'node server.js');
  for(const x of ['express','express-session','pg','multer','sharp','@aws-sdk/client-s3']) assert.ok(pkg.dependencies[x]);
});

test('server exposes upgraded routes',()=>{
  const s=fs.readFileSync(require('path').join(__dirname,'..','server.js'),'utf8');
  for(const x of ['/api/property-types','/api/properties/:id/media','/api/properties/:id/map','/api/ai/property-parse','/api/agents']) assert.ok(s.includes(x));
});

test('scalable mission foundation is wired',()=>{
  const s=fs.readFileSync(require('path').join(__dirname,'..','server.js'),'utf8');
  assert.ok(s.includes("ensureFoundation(pool)"));
  assert.ok(s.includes("startMissionWorker(pool)"));
  const a=fs.readFileSync(require('path').join(__dirname,'..','agents.js'),'utf8');
  for(const x of ['missions','mission_tasks','mission_events','FOR UPDATE SKIP LOCKED','requireTier(\'pro\')']) assert.ok(a.includes(x));
});
test('command center tier gating is present in UI',()=>{
  const s=fs.readFileSync(require('path').join(__dirname,'..','public','index.html'),'utf8');
  assert.ok(s.includes("subscription_tier"));
  assert.ok(s.includes("/api/subscription"));
});

test('all server-side JavaScript parses',()=>{
  const {execFileSync}=require('child_process');
  for(const f of ['server.js','foundation.js','agents.js','service-catalog.js','media-studio.js','maintenance-agent.js','payment-gateway.js','agent-catalog.js','tool-registry.js','omni-agent.js','ai-runtime.js']) execFileSync(process.execPath,['--check',require('path').join(__dirname,'..',f)],{stdio:'pipe'});
});
test('resilience boundaries are present',()=>{
  const s=fs.readFileSync(require('path').join(__dirname,'..','server.js'),'utf8');
  assert.ok(s.includes("/api/offline/sync"));
  assert.ok(s.includes("/api/billing"));
  const p=fs.readFileSync(require('path').join(__dirname,'..','package.json'),'utf8');
  assert.ok(p.includes("connect-pg-simple"));
});

test('plugin-ready Omni foundation is wired',()=>{
  const s=fs.readFileSync(require('path').join(__dirname,'..','server.js'),'utf8');
  assert.ok(s.includes("require('./omni-agent')"));
  assert.ok(s.includes("/api/omni"));
  const t=fs.readFileSync(require('path').join(__dirname,'..','tool-registry.js'),'utf8');
  assert.ok(t.includes('BUILTIN_TOOLS'));
  assert.ok(t.includes('selectTools'));
  const o=fs.readFileSync(require('path').join(__dirname,'..','omni-agent.js'),'utf8');
  assert.ok(o.includes('approval_required'));
  assert.ok(o.includes('owner_sensitive_action'));
});

test('agent registry and Guide AI are wired',()=>{
 const root=require('path').join(__dirname,'..');
 const a=fs.readFileSync(require('path').join(root,'agent-registry.js'),'utf8');
 const g=fs.readFileSync(require('path').join(root,'guide-ai.js'),'utf8');
 const srv=fs.readFileSync(require('path').join(root,'server.js'),'utf8');
 assert.ok(a.includes('selectAgents'));
 assert.ok(g.includes('goal-oriented-real-estate-copilot'));
 assert.ok(srv.includes('/api/agent-registry'));
 assert.ok(srv.includes('/api/guide'));
});

test('AI runtime is provider agnostic and fail-closed',()=>{
 const a=fs.readFileSync(require('path').join(__dirname,'..','ai-runtime.js'),'utf8');
 assert.ok(a.includes('AI_API_KEY'));
 assert.ok(a.includes('AI_BASE_URL'));
 assert.ok(a.includes('AI_PROVIDER_NOT_CONFIGURED'));
});

test('owner R&D agent catalog is extensible',()=>{
 const root=require('path').join(__dirname,'..');
 const c=fs.readFileSync(require('path').join(root,'agent-catalog.js'),'utf8');
 const r=fs.readFileSync(require('path').join(root,'agent-registry.js'),'utf8');
 for(const x of ['Research Agent','Competitor Intelligence','Product Strategy Agent','UX Agent','Architecture Agent','Security Agent','Business Intelligence Agent']) assert.ok(c.includes(x));
 assert.ok(r.includes('research'));
 assert.ok(r.includes('competitor'));
 assert.ok(r.includes('architecture'));
});

test('audit foundation and admin audit endpoint are wired',()=>{
 const f=read('foundation.js');
 const s=read('server.js');
 assert.ok(f.includes('CREATE TABLE IF NOT EXISTS audit_logs'));
 assert.ok(f.includes('idx_audit_user_created'));
 assert.ok(s.includes('/api/audit'));
 assert.ok(s.includes("action:'restore'"));
 assert.ok(s.includes("risk:'critical'"));
});

test('mission worker has stale recovery and retry boundaries',()=>{
 const a=read('agents.js');
 assert.ok(a.includes('recoverStaleWork'));
 assert.ok(a.includes('TASK_TIMEOUT'));
 assert.ok(a.includes('attempts < max_attempts'));
 assert.ok(a.includes('task.retry_scheduled'));
 assert.ok(!a.includes("if(busy)return; busy=true;\\n    const client"));
});

test('Owner Omni is admin-only and keeps sensitive approval gate',()=>{
 const o=fs.readFileSync(require('path').join(__dirname,'..','omni-agent.js'),'utf8');
 assert.ok(o.includes('ADMIN_REQUIRED'));
 assert.ok(o.includes('owner_sensitive_action'));
 assert.ok(o.includes("const status=p.approval_required?'blocked':'queued'"));
});
