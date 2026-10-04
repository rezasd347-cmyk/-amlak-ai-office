(() => {
  const css = `
  .ao{--ao-bg:#0b0d10;--ao-panel:#13171c;--ao-panel2:#191e25;--ao-line:#29313a;--ao-text:#f5f2eb;--ao-muted:#9ba4af;--ao-gold:#c8a45b;--ao-green:#59c28a;--ao-red:#df6a6a}
  .ao *{box-sizing:border-box}.ao{color:var(--ao-text)}
  .ao-shell{display:grid;grid-template-columns:250px minmax(0,1fr);gap:16px;min-height:calc(100vh - 110px)}
  .ao-side{background:linear-gradient(180deg,#15191f,#101318);border:1px solid var(--ao-line);border-radius:20px;padding:14px;position:sticky;top:92px;height:max-content}
  .ao-side-title{font-size:11px;color:var(--ao-muted);padding:8px 10px;text-transform:uppercase;letter-spacing:.7px}
  .ao-side button{width:100%;text-align:right;background:transparent;color:var(--ao-muted);border:1px solid transparent;padding:11px 12px;border-radius:12px;margin:2px 0}
  .ao-side button:hover{background:var(--ao-panel2);color:var(--ao-text);border-color:var(--ao-line)}
  .ao-main{min-width:0}.ao-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}
  .ao-kicker{font-size:12px;color:var(--ao-gold);font-weight:800}.ao-title{font-size:28px;font-weight:900;margin:4px 0}.ao-sub{color:var(--ao-muted);font-size:13px}
  .ao-status{border:1px solid var(--ao-line);background:var(--ao-panel);border-radius:999px;padding:8px 12px;font-size:12px;white-space:nowrap}
  .ao-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ao-green);margin-left:6px}
  .ao-command{background:linear-gradient(145deg,#1a1d21,#111419);border:1px solid #3a3324;border-radius:22px;padding:16px;box-shadow:0 18px 45px #0004}
  .ao-command-top{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.ao-command-title{font-weight:900}
  .ao-command-hint{font-size:12px;color:var(--ao-muted)}
  .ao-input-wrap{display:flex;gap:8px;align-items:flex-end}.ao-input-wrap textarea{min-height:62px;max-height:180px;margin:0;background:#0d1014;border-color:#343b44;border-radius:15px}
  .ao-send{height:62px;min-width:110px;border:0;border-radius:15px;background:var(--ao-gold);color:#111;font-weight:900}
  .ao-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.ao-chip{border:1px solid var(--ao-line);background:#11151a;color:var(--ao-muted);border-radius:999px;padding:7px 10px;font-size:11px}
  .ao-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:14px;margin-top:14px}.ao-card{background:linear-gradient(145deg,#171b20,#111419);border:1px solid var(--ao-line);border-radius:18px;padding:16px;min-width:0}
  .ao-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}.ao-card h2{font-size:16px;margin:0}.ao-link{background:none;border:0;color:var(--ao-gold);font-size:12px}
  .ao-agents{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ao-agent{border:1px solid var(--ao-line);background:#11151a;border-radius:14px;padding:12px}
  .ao-agent strong{font-size:13px}.ao-agent small{display:block;color:var(--ao-muted);margin-top:5px;font-size:11px}.ao-agent-tag{float:left;color:var(--ao-green);font-size:10px}
  .ao-jobs{display:grid;gap:8px}.ao-job{border:1px solid var(--ao-line);border-radius:12px;padding:11px;background:#101419}.ao-job-row{display:flex;justify-content:space-between;gap:8px}.ao-job small{color:var(--ao-muted)}
  .ao-badge{font-size:10px;border:1px solid var(--ao-line);border-radius:999px;padding:4px 7px;color:var(--ao-gold)}.ao-empty{color:var(--ao-muted);font-size:12px;padding:18px;text-align:center}
  .ao-legacy{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.ao-tool{border:1px solid var(--ao-line);background:#11151a;color:var(--ao-text);border-radius:13px;padding:12px;text-align:right}
  .ao-tool b{display:block;font-size:12px}.ao-tool span{display:block;color:var(--ao-muted);font-size:10px;margin-top:4px}
  .ao-result{margin-top:12px;border:1px solid #3a3324;background:#15130f;border-radius:14px;padding:12px;display:none}.ao-result.show{display:block}.ao-result pre{white-space:pre-wrap;word-break:break-word;color:#d9d4c8;font-size:11px;margin:8px 0 0;font-family:inherit}
  @media(max-width:900px){.ao-shell{grid-template-columns:1fr}.ao-side{position:static;display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.ao-side-title{grid-column:1/-1}.ao-grid{grid-template-columns:1fr}.ao-legacy{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:560px){.ao-head{display:block}.ao-status{display:inline-block;margin-top:10px}.ao-input-wrap{display:block}.ao-send{width:100%;margin-top:8px}.ao-agents{grid-template-columns:1fr}.ao-legacy{grid-template-columns:1fr}.ao-shell{min-height:0}}
  `;
  const style=document.createElement('style');style.id='amlak-office-center-css';style.textContent=css;document.head.appendChild(style);

  const escAO=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const callApi=(url,opt={})=>typeof api==='function'?api(url,opt):fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'خطا');return d});

  window.officeCenter=async function(){
    if(window.__aoTimer){clearInterval(window.__aoTimer);window.__aoTimer=null}
    if(typeof active==='function')active('officeCenter');
    const view=document.getElementById('view'); if(!view)return;
    view.innerHTML='<div class="ao"><div class="ao-empty">در حال آماده‌سازی مرکز فرمان...</div></div>';
    let agents=[],jobs=[];
    try{
      const [a,j]=await Promise.all([callApi('/api/agents'),callApi('/api/agents/missions')]);
      agents=a.agents||[];jobs=Array.isArray(j)?j:[];
    }catch(e){
      view.innerHTML='<div class="ao-card"><b>مرکز فرمان</b><p class="ao-sub">'+escAO(e.message)+'</p></div>';return;
    }
    const agentMap=Object.fromEntries(agents.map(x=>[x.id,x]));
    const jobHTML=jobs.slice(0,8).map(j=>`
      <div class="ao-job" data-mission="${escAO(j.id)}">
        <div class="ao-job-row"><strong>${escAO(j.command)}</strong><span class="ao-badge">${escAO(j.status)}</span></div>
        <small>مأموریت · ${escAO(j.created_at||'')}</small>
      </div>`).join('')||'<div class="ao-empty">هنوز مأموریتی از مرکز فرمان ثبت نشده است.</div>';
    const agentHTML=agents.map(a=>`
      <div class="ao-agent"><span class="ao-agent-tag">● آماده</span><strong>${escAO(a.name)}</strong><small>${escAO(a.role)}</small></div>`).join('');
    view.innerHTML=`
      <div class="ao">
        <div class="ao-shell">
          <aside class="ao-side">
            <div class="ao-side-title">مرکز عملیات</div>
            <button onclick="officeCenter()">⌂ نمای کلی</button>
            <button onclick="properties()">🏠 پرونده املاک</button>
            <button onclick="clients()">👥 مشتریان</button>
            <button onclick="matchView()">🔗 تطبیق هوشمند</button>
            <button onclick="followups()">⏱ پیگیری‌ها</button>
            <div class="ao-side-title">مدیریت</div>
            <button onclick="admin()">⚙️ مدیریت دفتر</button>
          </aside>
          <section class="ao-main">
            <div class="ao-head">
              <div><div class="ao-kicker">AI-FIRST REAL ESTATE OS</div><div class="ao-title">مرکز فرمان املاک</div><div class="ao-sub">یک ورودی ثابت برای همه قابلیت‌های آینده؛ ابزارها پشت این لایه مستقل می‌مانند.</div></div>
              <div class="ao-status"><span class="ao-dot"></span>سیستم آنلاین</div>
            </div>
            <div class="ao-command">
              <div class="ao-command-top"><div class="ao-command-title">دستور جدید</div><div class="ao-command-hint">طبیعی بنویس؛ Orchestrator مسیر کار را تعیین می‌کند.</div></div>
              <div class="ao-input-wrap"><textarea id="aoCommand" placeholder="مثلاً: برای فروش‌های امروز در یک منطقه مشخص سرنخ پیدا کن و گزارش بده..."></textarea><button class="ao-send" id="aoSend">اجرا</button></div>
              <div class="ao-chips">
                <button class="ao-chip" data-cmd="برای یک ملک تحلیل قیمت و سرمایه‌گذاری بده">تحلیل ملک</button>
                <button class="ao-chip" data-cmd="آگهی‌های عمومی یک منطقه را پیدا کن و گزارش بده">شکار سرنخ</button>
                <button class="ao-chip" data-cmd="برای مشتری‌های امروز پیگیری مناسب پیشنهاد بده">CRM</button>
                <button class="ao-chip" data-cmd="این سیستم را تست کن و ایرادهای مهم را گزارش بده">تست سیستم</button>
              </div>
              <div id="aoResult" class="ao-result"></div>
            </div>
            <div class="ao-grid">
              <div class="ao-card"><div class="ao-card-head"><h2>تیم هوش مصنوعی</h2><span class="ao-sub">${agents.length} Agent</span></div><div class="ao-agents">${agentHTML}</div></div>
              <div class="ao-card"><div class="ao-card-head"><h2>آخرین مأموریت‌ها</h2><button class="ao-link" id="aoRefresh">تازه‌سازی</button></div><div class="ao-jobs" id="aoJobs">${jobHTML}</div></div>
            </div>
            <div class="ao-card" style="margin-top:14px"><div class="ao-card-head"><h2>ابزارهای موجود</h2><span class="ao-sub">این‌ها دست‌نخورده و مستقل می‌مانند</span></div>
              <div class="ao-legacy">
                <button class="ao-tool" onclick="propertyForm()"><b>➕ ثبت ملک</b><span>پرونده جدید</span></button>
                <button class="ao-tool" onclick="clientForm()"><b>👤 ثبت مشتری</b><span>CRM</span></button>
                <button class="ao-tool" onclick="openFollowForm()"><b>⏰ پیگیری</b><span>Follow-up</span></button>
                <button class="ao-tool" onclick="matchView()"><b>🔗 تطبیق</b><span>Matching</span></button>
              </div>
            </div>
          </section>
        </div>
      </div>`;
    const input=document.getElementById('aoCommand'),send=document.getElementById('aoSend'),result=document.getElementById('aoResult');
    const run=async()=>{
      const command=input.value.trim();if(!command)return;
      send.disabled=true;send.textContent='در حال اجرا...';result.className='ao-result show';result.innerHTML='<b>در حال اجرای مأموریت...</b>';
      try{
        const r=await callApi('/api/agents/command',{method:'POST',body:JSON.stringify({command,idempotency_key:'ao-'+Date.now()+'-'+Math.random().toString(36).slice(2)})});
        result.innerHTML='<b>مأموریت ثبت شد</b><pre>'+escAO(JSON.stringify(r,null,2))+'</pre>';
        const j=await callApi('/api/agents/missions');document.getElementById('aoJobs').innerHTML=(Array.isArray(j)?j.slice(0,8):[]).map(x=>`<div class="ao-job" data-mission="${escAO(x.id)}"><div class="ao-job-row"><strong>${escAO(x.command)}</strong><span class="ao-badge">${escAO(x.status)}</span></div><small>مأموریت · ${escAO(x.updated_at||x.created_at||'')}</small></div>`).join('')||'<div class="ao-empty">مأموریتی ثبت نشده.</div>';
      }catch(e){result.innerHTML='<b>خطا</b><pre>'+escAO(e.message)+'</pre>'}
      finally{send.disabled=false;send.textContent='اجرا'}
    };    send.onclick=run;window.__aoTimer=setInterval(async()=>{try{const ms=await callApi('/api/agents/missions');const box=document.getElementById('aoJobs');if(!box)return;box.innerHTML=(Array.isArray(ms)?ms.slice(0,8):[]).map(x=>`<div class="ao-job" data-mission="${escAO(x.id)}"><div class="ao-job-row"><strong>${escAO(x.command)}</strong><span class="ao-badge">${escAO(x.status)}</span></div><small>مأموریت · ${escAO(x.updated_at||x.created_at||'')}</small></div>`).join('')||'<div class="ao-empty">مأموریتی ثبت نشده.</div>';}catch{}} ,5000);document.getElementById('aoJobs').onclick=async(e)=>{const card=e.target.closest('[data-mission]');if(!card)return;try{const d=await callApi('/api/agents/missions/'+card.dataset.mission);result.className='ao-result show';result.innerHTML='<b>جزئیات مأموریت</b><pre>'+escAO(JSON.stringify(d,null,2))+'</pre>'}catch(err){result.className='ao-result show';result.innerHTML='<b>خطا</b><pre>'+escAO(err.message)+'</pre>'}};input.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')run()});
    view.querySelectorAll('.ao-chip').forEach(b=>b.onclick=()=>{input.value=b.dataset.cmd;input.focus()});
    document.getElementById('aoRefresh').onclick=()=>window.officeCenter();
  };
})();