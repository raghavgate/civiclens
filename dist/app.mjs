import {calculate,routeQuestion,propertyTax} from './model.mjs';
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const defaults={income:75000,rent:2200,utilities:150,price:400000,down:20,rate:6.5,tax:1.1,insurance:150,maintenance:1,hoa:0,pmi:.5};
let state={...defaults},mode='rent';
const specs={income:['Annual household income',20000,250000,1000,'money'],rent:['Monthly rent',500,6000,50,'money'],utilities:['Monthly utilities',0,800,10,'money'],price:['Home price',100000,1500000,10000,'money'],down:['Down payment',0,100,1,'%'],rate:['Mortgage interest rate',0,15,.1,'%'],tax:['Annual property tax rate',0,4,.1,'%'],insurance:['Monthly home insurance',0,1000,10,'money'],maintenance:['Annual maintenance reserve',0,5,.1,'%'],hoa:['Monthly HOA dues',0,1500,25,'money'],pmi:['Annual mortgage insurance rate',0,2,.1,'%']};
function controls(keys){return keys.map(k=>{const [label,min,max,step,unit]=specs[k];return `<div class="control"><label for="${k}">${label}<output id="${k}Out" for="${k}">${unit==='money'?money(state[k]):state[k]+'%'}</output></label><input id="${k}" data-key="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${state[k]}"><div class="rangelabels"><span>${unit==='money'?money(min):min+'%'}</span><span>${unit==='money'?money(max):max+'%'}</span></div></div>`}).join('')}
function setup(){
 $('controls').innerHTML=controls(mode==='rent'?['income','rent','utilities']:['income','price','down','rate']);
 $('advanced').innerHTML=mode==='rent'?'<p class="small">Rent plus utilities. Excludes parking, moving costs, deposits, and renters insurance. Add recurring charges to rent for a closer estimate.</p>':controls(['utilities','tax','insurance','maintenance','hoa','pmi'])+'<p class="small">30-year fixed loan. Mortgage insurance applies below 20% down at the assumed rate. Actual loan programs differ. Excludes closing costs, taxes on income, other debts, and opportunity cost.</p>';
 document.querySelectorAll('[data-key]').forEach(el=>el.addEventListener('input',()=>{state[el.dataset.key]=Number(el.value);const unit=specs[el.dataset.key][4];$(el.id+'Out').textContent=unit==='money'?money(Number(el.value)):el.value+'%';render()}));
 $('rentMode').setAttribute('aria-pressed',mode==='rent');$('buyMode').setAttribute('aria-pressed',mode==='buy');
 $('change').min=mode==='rent'?-20:-2;$('change').max=mode==='rent'?20:2;$('change').step=mode==='rent'?1:.1;$('change').value=mode==='rent'?-10:-1;
 $('changeMin').textContent=mode==='rent'?'−20% rent':'−2 percentage points';$('changeMax').textContent=mode==='rent'?'+20% rent':'+2 percentage points';render();
}
function render(){const r=calculate(state),buy=mode==='buy',cost=buy?r.owning:r.renting,share=buy?r.ownShare:r.rentShare,gap=cost-r.benchmark;
 $('monthly').textContent=money(cost);$('share').textContent=share.toFixed(1)+'%';$('meterFill').style.width=Math.min(100,share/60*100)+'%';
 $('interpretation').textContent=gap>0?`In this example, housing takes ${share.toFixed(1)}% of income before taxes. That is above the 30% cost-burden reference. What feels manageable also depends on debts, household needs, and other expenses.`:`In this example, housing takes ${share.toFixed(1)}% of income before taxes. That is within the 30% reference, but it doesn’t establish what this household can comfortably afford.`;
 $('benchmark').textContent=money(r.benchmark)+'/mo';$('gapLabel').textContent=gap>0?'Above that reference':'Below that reference';$('gap').textContent=money(Math.abs(gap))+'/mo';
 const change=Number($('change').value),newRate=Math.max(0,state.rate+change),alternate=calculate({...state,...(buy?{rate:newRate}:{rent:state.rent*(1+change/100)})}),newCost=buy?alternate.owning:alternate.renting,delta=newCost-cost;
 $('changeValue').textContent=(change>0?'+':'')+change+(buy?' pp':'%');
 $('scenarioTitle').textContent=buy?`What if the rate were ${newRate.toFixed(1)}%?`:`What if rent were ${Math.abs(change)}% ${change<=0?'lower':'higher'}?`;
 $('scenarioText').textContent=`Housing would be ${money(newCost)} per month — ${money(Math.abs(delta))} ${delta<=0?'less':'more'} than the base scenario. ${buy?'Home price, down payment, and other costs stay fixed. Rates cannot go below zero in this model.':'Utilities and income stay fixed.'}`;
 const rows=buy?Object.entries(r.parts):[['Rent',state.rent],['Utilities',state.utilities]];
 $('mathContent').innerHTML=`<p>${buy?'Fixed-rate amortization: M = P × r ÷ [1 − (1 + r)<sup>−n</sup>]. P is the loan principal, r is annual interest ÷ 100 ÷ 12, and n = 360 monthly payments. At 0% interest, M = P ÷ 360.':'Housing cost = monthly rent + monthly utilities.'}</p>`+rows.map(([label,value])=>`<div class="mathrow"><span>${label}</span><b>${money(value)}</b></div>`).join('')+`<p>Monthly gross income = ${money(state.income)} ÷ 12 = ${money(r.monthlyIncome)}.<br>Housing share = ${money(cost)} ÷ ${money(r.monthlyIncome)} × 100 = ${share.toFixed(1)}%.<br>30% reference = ${money(r.monthlyIncome)} × 0.30 = ${money(r.benchmark)}.</p>`+(buy?`<p>Loan principal = ${money(state.price)} × (1 − ${state.down}/100) = ${money(r.principal)}. Tax and maintenance each use home price × annual assumed percentage ÷ 12. Mortgage insurance uses loan principal × annual assumed percentage ÷ 12 when down payment is below 20%. These are simplified assumptions, not lender quotes. The buyer budget includes a maintenance reserve, so its share is not a direct reproduction of the official cost-burden measure.</p>`:'')+'<p>Displayed dollars are rounded; calculations use full precision. Maintenance is a reserve, not a guaranteed monthly bill. Owning versus renting costs do not measure investment returns or decide which choice is better.</p>';
}
function selectMode(next){mode=next;setup();$('answerTitle').textContent=next==='buy'?'What would buying a home cost each month?':'Why does rent feel so expensive?';$('answer').textContent=next==='buy'?'The price tag is only the beginning. Interest, taxes, insurance, and upkeep all affect the monthly cost. Change one assumption at a time to see its effect.':'Start with the gap between housing costs and income. Explore that gap below, then see the policy levers that can influence it.';}
$('rentMode').onclick=()=>selectMode('rent');$('buyMode').onclick=()=>selectMode('buy');$('change').oninput=render;$('reset').onclick=()=>{state={...defaults};setup()};
// Only the question text is sent. Calculator values stay in `state` on this page.
const COPY={
  rent_budget:['Why does rent feel so expensive?','A rent payment feels different at every income. This model shows the budget pressure; sourced rules appear above when you ask about a specific law.'],
  mortgage_cost:['What would buying a home cost each month?','The price tag is only the beginning. Interest, taxes, insurance, and upkeep all affect the monthly cost. Change one assumption at a time to see its effect.'],
  property_tax:['How is California property tax calculated?','Under Proposition 13, the tax base starts at the purchase price and can rise at most 2% a year. Try the calculator below; the rules it uses are cited above.'],
  policy_evidence:['What the law says','Below are statements drawn directly from official California sources, each linked to its record. Nothing here is legal advice.'],
}
const ABSTAIN={
  unsupported_question:'CivicLens covers California housing, property tax, and health coverage rules. It does not answer other topics or give voting, legal, or financial advice.',
  jurisdiction_required:'Which state? CivicLens only states legal rules for a named jurisdiction. Add “in California” to your question.',
  jurisdiction_not_covered:'CivicLens currently has sourced records for California only.',
  no_evidence:'No record in the California source set addresses this question, so no legal claim is made.',
  no_valid_facts:'A draft answer was produced, but none of its statements were supported by the cited sources, so it was withheld.',
  no_facts:'The sources retrieved did not answer this question.',
  model_error:'The answer service did not respond. Nothing was guessed in its place.',
  malformed_answer:'The answer did not pass validation and was withheld.',
  missing_uncertainties:'The answer did not state its limitations, so it was withheld.',
  malformed_coverage:'The answer did not pass validation and was withheld.',
}
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const safeUrl=u=>/^https:\/\//.test(u)?u:'#'

async function fetchAnswer(question){
  const res=await fetch('api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})})
  if(!res.ok)throw new Error('api '+res.status)
  return res.json()
}
function localAnswer(question){
  const {intent,domain}=routeQuestion(question)
  return {offline:true,intent,domain,abstained:intent==='unsupported'||intent==='policy_evidence',reason:intent==='unsupported'?'unsupported_question':'offline',facts:[],evidence:[],uncertainties:['The answer service is not reachable from this page, so no sourced statements are shown.'],coverage:'none'}
}
function renderGrounded(r){
  const box=$('grounded'),showFacts=r.facts.length>0,show=showFacts||r.abstained||r.intent==='policy_evidence'
  box.hidden=!show
  if(!show)return
  $('coverage').textContent=r.abstained?'NO ANSWER GIVEN':`COVERAGE: ${r.coverage.toUpperCase()}`
  const ix=new Map(r.evidence.map((e,i)=>[e.id,i+1]))
  $('facts').innerHTML=r.facts.map(f=>`<li>${esc(f.claim)}${f.evidenceIds.map(id=>`<a class="cite" href="#ev-${esc(id)}" title="${esc(id)}">[${ix.get(id)}]</a>`).join('')}</li>`).join('')
  $('facts').hidden=!showFacts
  $('abstain').hidden=!r.abstained
  $('abstain').textContent=r.offline?'Sourced answers need the CivicLens server (npm start). The calculator below still works offline.':(ABSTAIN[r.reason]??'No sourced answer was given.')
  $('uncertainties').innerHTML=r.uncertainties.map(u=>`<li>${esc(u)}</li>`).join('')
  $('evidenceDetails').hidden=!r.evidence.length
  $('evidenceList').innerHTML=r.evidence.map((e,i)=>`<div class="evrecord" id="ev-${esc(e.id)}"><b>[${i+1}]</b> <a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">${esc(e.title)} ↗</a><div class="status">${esc(e.status.replace('_',' '))} · ${esc(e.jurisdiction)} · effective ${esc(e.effectiveDate??'n/a')} · retrieved ${esc(e.retrievedAt)}</div><blockquote>${esc(e.passage)}</blockquote></div>`).join('')
}
let tax={price:750000,years:10,inflation:3,localRate:.2,marketGrowth:5}
const taxSpecs={price:['Purchase price',100000,3000000,10000,'money'],years:['Years owned',0,40,1,'yr'],inflation:['Inflation (CPI) per year',0,8,.1,'%'],localRate:['Voter-approved local rate',0,1,.01,'%'],marketGrowth:['Market value growth per year',-5,12,.5,'%']}
function fmtTax(k,v){const u=taxSpecs[k][4];return u==='money'?money(v):u==='yr'?v+' yr':v+'%'}
function setupTax(){
  $('ptControls').innerHTML=Object.entries(taxSpecs).map(([k,[label,min,max,step]])=>`<div class="control"><label for="pt_${k}">${label}<output id="pt_${k}Out" for="pt_${k}">${fmtTax(k,tax[k])}</output></label><input id="pt_${k}" data-tax="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${tax[k]}"></div>`).join('')
  document.querySelectorAll('[data-tax]').forEach(el=>el.addEventListener('input',()=>{tax[el.dataset.tax]=Number(el.value);$(el.id+'Out').textContent=fmtTax(el.dataset.tax,tax[el.dataset.tax]);renderTax()}))
  renderTax()
}
function renderTax(){
  const r=propertyTax(tax)
  $('ptYearLabel').textContent=`Annual tax in year ${tax.years}`
  $('ptTax').textContent=money(r.annualTax)
  $('ptMarket').textContent=money(r.ifReassessed)
  $('ptText').textContent=tax.inflation>2?`Inflation is above 2%, so the assessed value grows at the 2% cap. At a ${r.rate.toFixed(2)}% total rate, the tax is ${money(r.annualTax)} versus ${money(r.ifReassessed)} if the home were taxed on market value — a ${money(Math.abs(r.gap))} ${r.gap>=0?'difference a new buyer of the same home would pay':'difference'}.`:`Assessed value grows with inflation (${tax.inflation}%), under the 2% cap. At a ${r.rate.toFixed(2)}% total rate, the tax is ${money(r.annualTax)}.`
}
async function ask(question){
  $('routing').textContent='Checking sources…'
  let r
  try{r=await fetchAnswer(question)}catch{r=localAnswer(question)}
  const intent=r.intent
  if(intent==='rent_budget')selectMode('rent')
  if(intent==='mortgage_cost')selectMode('buy')
  $('proptax').hidden=intent!=='property_tax'&&r.domain!=='tax'
  const [title,body]=COPY[intent]??['Let’s keep this focused.',ABSTAIN.unsupported_question]
  $('answerTitle').textContent=title
  $('answer').textContent=body
  renderGrounded(r)
  $('routing').textContent=r.offline?'Offline · keyword routing only · no sourced statements':`Intent: ${intent.replace('_',' ')}${r.domain?' · '+r.domain:''} · ${r.facts.length} sourced statement${r.facts.length===1?'':'s'}${r.rejected?.length?` · ${r.rejected.length} withheld by validation`:''}${r.meta?.redactions?` · ${r.meta.redactions} detail${r.meta.redactions===1?'':'s'} redacted before sending`:''}`
  $('explore').scrollIntoView({behavior:'smooth'})
}
setupTax()
$('questionForm').onsubmit=e=>{e.preventDefault();const q=$('question').value.trim();if(q)ask(q);else{$('question').value='Why is my rent so expensive?';ask($('question').value)}};document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{$('question').value=b.dataset.question;ask(b.dataset.question)});
$('aboutButton').onclick=()=>$('about').showModal();$('closeAbout').onclick=()=>$('about').close();setup();
