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
test('command center is Pro gated in UI',()=>{
  const s=fs.readFileSync(require('path').join(__dirname,'..','public','index.html'),'utf8');
  assert.ok(s.includes("me.subscription_tier==='pro'"));
  assert.ok(s.includes("/api/subscription"));
});

test('all server-side JavaScript parses',()=>{
  const {execFileSync}=require('child_process');
  for(const f of ['server.js','foundation.js','agents.js','service-catalog.js','media-studio.js','maintenance-agent.js','payment-gateway.js','agent-catalog.js','tool-registry.js','omni-agent.js']) execFileSync(process.execPath,['--check',require('path').join(__dirname,'..',f)],{stdio:'pipe'});
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
