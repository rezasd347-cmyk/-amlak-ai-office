(function(){
  function show(message){var el=document.getElementById('loginMsg');if(el)el.textContent=message;}
  function email(){return (document.getElementById('email')?.value||'').trim();}
  function busy(id,on,label){var b=document.getElementById(id);if(!b)return;b.disabled=on;if(on)b.dataset.label=b.textContent; b.textContent=on?label:(b.dataset.label||b.textContent);}
  async function post(path,body){
    var response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var data={};try{data=await response.json();}catch(_){}
    if(!response.ok)throw new Error(data.error||('خطا (HTTP '+response.status+')'));
    return data;
  }
  async function doAdminLogin(){
    var e=email(),p=document.getElementById('password')?.value||'';
    if(!e||!p){show('ایمیل مدیر و رمز اختصاصی را وارد کنید');return;}
    busy('loginBtn',true,'در حال ورود…');show('');
    try{await post('/api/login',{email:e,password:p});window.location.reload();}
    catch(err){show(err.message||'ورود انجام نشد');}
    finally{busy('loginBtn',false,'ورود مدیر با رمز');}
  }
  async function requestCode(){
    var e=email();if(!e){show('ابتدا ایمیل حساب کاربری را وارد کنید');return;}
    busy('requestCodeBtn',true,'در حال ارسال…');show('');
    try{var d=await post('/api/auth/request-code',{email:e});document.getElementById('codeArea')?.classList.remove('hidden');show(d.message||'اگر حساب فعال باشد، کد ارسال می‌شود.');}
    catch(err){show(err.message||'ارسال کد ناموفق بود');}
    finally{busy('requestCodeBtn',false,'ارسال کد ورود به ایمیل');}
  }
  async function verifyCode(){
    var e=email(),code=(document.getElementById('emailCode')?.value||'').trim();
    if(!e||!/^\d{6}$/.test(code)){show('ایمیل و کد شش‌رقمی را وارد کنید');return;}
    busy('verifyCodeBtn',true,'در حال تأیید…');show('');
    try{await post('/api/auth/verify-code',{email:e,code});window.location.reload();}
    catch(err){show(err.message||'تأیید کد ناموفق بود');}
    finally{busy('verifyCodeBtn',false,'تأیید کد و ورود');}
  }
  document.addEventListener('DOMContentLoaded',function(){
    document.getElementById('loginBtn')?.addEventListener('click',doAdminLogin);
    document.getElementById('requestCodeBtn')?.addEventListener('click',requestCode);
    document.getElementById('verifyCodeBtn')?.addEventListener('click',verifyCode);
    document.getElementById('password')?.addEventListener('keydown',function(e){if(e.key==='Enter')doAdminLogin();});
    document.getElementById('emailCode')?.addEventListener('keydown',function(e){if(e.key==='Enter')verifyCode();});
  });
})();