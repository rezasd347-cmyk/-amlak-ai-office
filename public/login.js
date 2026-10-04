(function(){
  function show(message){
    var el=document.getElementById('loginMsg');
    if(el) el.textContent=message;
  }
  async function doLogin(){
    var email=document.getElementById('email');
    var password=document.getElementById('password');
    var button=document.getElementById('loginBtn');
    var e=(email&&email.value||'').trim();
    var p=(password&&password.value)||'';
    if(!e||!p){show('ایمیل و رمز عبور را وارد کنید');return;}
    if(button){button.disabled=true;button.textContent='در حال ورود…';}
    show('');
    try{
      var response=await fetch('/api/login',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:e,password:p})
      });
      var data={};
      try{data=await response.json();}catch(_){}
      if(!response.ok) throw new Error(data.error||('خطا (HTTP '+response.status+')'));
      var typesResponse=await fetch('/api/property-types',{credentials:'same-origin'});
      if(!typesResponse.ok) throw new Error('ورود انجام شد، اما اطلاعات اولیه صفحه دریافت نشد.');
      window.location.reload();
    }catch(err){
      show(err&&err.message?err.message:'ورود انجام نشد');
    }finally{
      if(button){button.disabled=false;button.textContent='ورود';}
    }
  }
  window.login=doLogin;
  document.addEventListener('DOMContentLoaded',function(){
    var b=document.getElementById('loginBtn');
    if(b) b.addEventListener('click',doLogin);
    var p=document.getElementById('password');
    if(p) p.addEventListener('keydown',function(ev){if(ev.key==='Enter')doLogin();});
  });
})();