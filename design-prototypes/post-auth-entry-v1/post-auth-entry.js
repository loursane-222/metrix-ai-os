const stage=document.querySelector('.stage');
const params=new URLSearchParams(location.search);
stage.dataset.state=params.get('state')==='loading'?'loading':'setup';
const form=document.querySelector('#organization-form');
const input=document.querySelector('#organization-name');
const button=form.querySelector('button');
const error=form.querySelector('.error');
const label=button.querySelector('.button-label');
input.addEventListener('input',()=>{button.disabled=!input.value.trim();error.hidden=true});
form.addEventListener('submit',(event)=>{
  event.preventDefault();
  if(!input.value.trim()){error.hidden=false;input.focus();return}
  input.disabled=true;button.disabled=true;label.textContent='Oluşturuluyor…';button.classList.add('busy');
  window.setTimeout(()=>{input.disabled=false;button.disabled=false;label.textContent='Çalışma ortamını oluştur'},1400);
});
