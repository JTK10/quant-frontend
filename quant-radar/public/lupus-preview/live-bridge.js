'use strict';
if(new URLSearchParams(location.search).get('embedded')==='1')document.body.classList.add('embedded');
const liveMode=new URLSearchParams(location.search).get('mode')==='live';
if(liveMode){
  document.querySelector('.replay-badge').textContent='LIVE SCANNER';
  document.querySelector('.heading p').textContent='Current Rusty inputs · completed candles · filtered Top 3';
  document.getElementById('aiStudyButton').disabled=true;
  document.getElementById('aiStudyButton').title='The AI study is historical; live scanning uses the rule scanner';
  for(const id of ['session','previous','next','timeline'])document.getElementById(id).disabled=true;
  document.getElementById('timeLabel').textContent='—';
  for(const side of ['bull','bear'])document.getElementById(side+'Rows').innerHTML='<tr><td colspan="7" class="empty">Waiting for current-session Rusty captures.</td></tr>';
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='LUPUS_LIVE')return;
    const message=event.data;
    if(message.error){showError(message.error+' · last received board retained.');return;}
    document.getElementById('error').hidden=true;
    if(state.date!==message.date){state.data=null;for(const side of ['bull','bear']){document.getElementById(side+'Rows').innerHTML='<tr><td colspan="7" class="empty">Waiting for this session.</td></tr>';document.getElementById(side+'Count').textContent='0';}}
    state.date=message.date;document.getElementById('session').innerHTML=`<option>${esc(message.date)}</option>`;
    if(message.snapshot){
      const s=message.snapshot;state.liveMessage=`${message.date} / ${s.cut} IST / ${message.message}`;state.cut=s.cut;state.data={date:message.date,cuts:{[s.cut]:{bull:s.bull??[],bear:s.bear??[]}}};render();
      document.getElementById('session').disabled=true;
      document.getElementById('status').textContent=`${message.date} · ${s.cut} IST · ${message.message}${s.detail==='Recovered decision'?' · recovered capture':''}`;
    }else document.getElementById('status').textContent=message.date+' · '+message.message;
    if(message.stale||message.health==='ERROR')showError(message.message+' · displayed rows are the last received snapshot.');
  });
}
