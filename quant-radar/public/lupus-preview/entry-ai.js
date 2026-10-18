/* Read-only model study; loads only on explicit click, never changes rule ranks. */
(()=>{
 let data=null,model='ai_all_features';
 const labels={ai_validated_admission:'AI · selective admission (experimental)',ai_all_features:'AI · price + OI + traps',ai_price_only:'AI · price action only',rule_baseline:'Current rules · same 3-entry limit'};
 const safe=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>Number.isFinite(v)?v.toFixed(2):'—';
 function renderStudy(){
  const date=document.getElementById('session').value,cut=document.getElementById('timeLabel').textContent;
  const picks=data.entries.filter(r=>r.date===date&&r.selection_model===model&&r.time_ist<=cut).sort((a,b)=>a.time_ist.localeCompare(b.time_ist));
  const admission=data.admission_audit.find(r=>r.test_date===date);
  const fold=data.folds.find(r=>r.test_date===date);
  document.getElementById('detailContent').innerHTML=`<div class="eyebrow">ENTRY AI · RESEARCH</div><h2>Three entries maximum</h2><p>${safe(date)} · as of ${safe(cut)} IST · ${picks.length}/3 selected across both sides</p>
   <select id="aiStudyModel" aria-label="Study model">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===model?'selected':''}>${v}</option>`).join('')}</select>
   <p>Every five minutes, 09:30–10:55. At most one new stock per cut. Entry five minutes later, by 11:00. Earlier selections stay fixed.</p>
   ${fold?`<p>Trained through ${safe(fold.train_max_date)} (${fold.train_dates} earlier sessions). AI score estimates gross stock return; it is not confidence or a win probability.</p>`:'<p class="notice">This session is training warm-up; no walk-forward selections are available.</p>'}
   ${model === 'ai_validated_admission' ? `<p class="notice">Admission uses only earlier validation days. Today: ${safe(admission?.decision)}; threshold ${num(admission?.threshold)}%. October: only 3 entries on 1 day, 2 positive and 1 negative. Too few to establish reliability.</p>` : ''}
   ${picks.length?picks.map((r,i)=>`<section class="ai-pick"><h3><span class="${r.side==='BULL'?'up':'down'}">${i+1}. ${safe(r.symbol)} · ${safe(r.side)}</span> <a class="stock-tv" target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/chart/?symbol=NSE%3A${encodeURIComponent(r.symbol)}">↗</a></h3><p>Decision ${r.time_ist} · ${r.entry_time_ist<=cut?'Entry':'Scheduled entry'} ${safe(r.entry_time_ist)} · ${model==='rule_baseline'?'Rule rank score':'Estimated gross return'} ${num(r.selection_score)}${model==='rule_baseline'?'':'%'}</p>
   <details><summary>Decision inputs · CE ${num(r.ce_pct)}% / PE ${num(r.pe_pct)}%</summary><div class="facts"><div><small>PRICE AT DECISION</small><strong>₹${num(r.price_at_signal)}</strong></div><div><small>CE / PE CUMULATIVE</small><strong>${num(r.ce_pct)}% / ${num(r.pe_pct)}%</strong></div><div><small>PDH / PDL</small><strong>${num(r.pdh)} / ${num(r.pdl)}</strong></div><div><small>STOCKS ABOVE OPEN</small><strong>${num(100*r.market_up_fraction)}%</strong></div></div>
   <p>Nearest prior failed-above OI line: ${num(r.failed_above_line)} (${safe(r.failed_above_date)}). These are decision-time inputs, not proof of why the model selected the stock.</p></details>
   <details class="outcome"><summary>Historical outcome · future information</summary><p>Entry ₹${num(r.entry)} · exit ${safe(r.exit_time_ist)} · ${safe(r.exit_reason)}. Gross return ${num(r.gross_stock_return_pct)}%; remaining-session MFE ${num(r.remaining_session_mfe_pct)}%.</p></details></section>`).join(''):'<p class="notice">No selections by this cut. A day marked ABSTAIN stays empty.</p>'}
   <details class="outcome"><summary>October comparison · historical outcomes</summary><p>${data.comparison_days} shared test sessions from ${safe(data.comparison_start)}. Stock simulation: 1.5% target, 0.75% stop, EOD exit. Returns before costs; MFE is not realised profit.</p><div class="ai-comparison"><table><thead><tr><th>Model</th><th>Picks</th><th>Positive</th><th>Avg gross</th></tr></thead><tbody>${data.comparison.map(r=>`<tr><td>${safe(labels[r.model])}</td><td>${r.selected_entries}</td><td>${num(r.hit_rate_pct)}%</td><td>${num(r.average_gross_return_pct)}%</td></tr>`).join('')}</tbody></table></div><p>All dates were previously inspected. This is chronological retrospective testing, not untouched forward validation. The final saved model is trained on ${data.training_dates} sessions and is not used for these historical predictions.</p></details>`;
  document.getElementById('aiStudyModel').onchange=e=>{model=e.target.value;renderStudy();};
 }
 document.getElementById('aiStudyButton').onclick=async()=>{
  const dialog=document.getElementById('detail');
  document.getElementById('detailContent').textContent='Loading model study…';if(!dialog.open)dialog.showModal();
  try{if(!data){const response=await fetch('data/entry-ai.json?v=ai2');if(!response.ok)throw new Error('Model results are not available yet.');data=await response.json();}renderStudy();}
  catch(error){document.getElementById('detailContent').textContent=error.message;}
 };
})();


