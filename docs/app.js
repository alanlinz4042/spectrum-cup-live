(function(){
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TEAMS={PS:'Pin Seekers',IL:'Iron Legends'};
const OTHER={PS:'IL',IL:'PS'};
const ROUNDS=[
 {id:'r1',n:1,day:'Thu',course:'Ozarks National',format:'both',fmt:'2v2 Net · Both Scores Count',holes:18,segs:[['front','Front 9',1,9,1],['back','Back 9',10,18,1],['overall','Overall',1,18,1]],matches:3},
 {id:'r2',n:2,day:'Thu',course:'Cliffhangers Par 3',format:'scramble',gross:true,fmt:'2v2 Scramble Match Play · Gross, no handicaps',holes:18,segs:[['front','Front 9',1,9,1],['back','Back 9',10,18,1],['overall','Overall',1,18,1]],matches:3},
 {id:'r3',n:3,day:'Fri',course:'Top of the Rock',format:'altshot',gross:true,fmt:'2v2 Modified Alternate Shot · Gross, no handicaps · Winner Takes All',holes:9,segs:[['overall','Winner takes all',1,9,3]],matches:3},
 {id:'r4',n:4,day:'Fri',course:'Buffalo Ridge',format:'bestball',fmt:'2v2 Net Best Ball',holes:18,segs:[['front','Front 9',1,9,1],['back','Back 9',10,18,1],['overall','Overall',1,18,1]],matches:3},
 {id:'r5',n:5,day:'Sat',course:'Mountain Top Par 3',format:'stroke',fmt:'1v1 Net Stroke Play',holes:13,segs:[['front','Front 6',1,6,1],['back','Back 7',7,13,1],['overall','Overall',1,13,1]],matches:6},
 {id:'r6',n:6,day:'Sat',course:"Payne's Valley",format:'match',fmt:'1v1 Net Match Play',holes:18,segs:[['front','Front 9',1,9,1],['back','Back 9',10,18,1],['overall','Overall',1,18,1]],matches:6},
];
const RBY=Object.fromEntries(ROUNDS.map(r=>[r.id,r]));
const TEAMBALL=f=>f==='scramble'||f==='altshot';
const SINGLES=f=>f==='stroke'||f==='match';
// Captains are fixed to their teams: Bryan Stoddard leads Iron Legends, Cory Adcroft leads Pin Seekers. Not editable in Setup.
const LOCKED_TEAM={stoddard:'IL',adcroft:'PS'};

// ---------- state ----------
let db=null,userCap=null,canWrite=null,isAdmin=false,me='';
// Everyone who scores is an Editor (the share menu's only writing tier), so Setup is gated on identity instead:
// the owner always, otherwise an Editor who has picked a captain's name. Honor system among friends; the DB still needs Editor.
let ownerCap=false,editorCap=false;
function refreshAdmin(){const was=isAdmin;isAdmin=ownerCap||(editorCap&&!!(players[me]&&players[me].captain));return was!==isAdmin}
// Can this viewer edit the given score column? Admins always; otherwise only their own name (soft mode) or anyone in the match (group mode).
function mayEdit(colPids){if(canWrite===false)return false;if(isAdmin)return true;const mode=(settings&&settings.entry)||'self';if(mode==='group')return true;return !!me&&colPids.includes(me)}
let players={},settings=null,pairings={},scores={},side={};
let tab='cup',curRound='r1',curMatch=0,pairRound='r1',fullSheet=false;
try{me=localStorage.getItem('sc_me')||'';tab=localStorage.getItem('sc_tab')||'cup';curRound=localStorage.getItem('sc_round')||'r1'}catch(e){}
if(!RBY[curRound])curRound='r1';
if(/^#(live|cup)$/.test(location.hash))tab=location.hash.slice(1);if(tab!=='live'&&tab!=='cup')tab='cup';
fullSheet=window.innerWidth>=760;

// ---------- handicap engine ----------
function course(rid){return (settings&&settings.courses&&settings.courses[rid])||null}
function parOf(rid,h){const c=course(rid);return c&&c.par&&c.par[h-1]?+c.par[h-1]:(RBY[rid].holes===18&&!/Par 3/.test(RBY[rid].course)?4:3)}
function siOf(rid,h){const c=course(rid);return c&&c.si&&c.si[h-1]?+c.si[h-1]:h}
function courseHcp(pid,rid){
  if(RBY[rid].gross)return 0; // R2 Cliffhangers and R3 Top of the Rock are played gross: nobody gets a stroke
  const p=players[pid];if(!p||p.index==null||p.index==='')return null;
  const c=course(rid)||{};const r=RBY[rid];
  const slope=+c.slope||113;const parT=(c.par||[]).reduce((a,b)=>a+(+b||0),0)||r.holes*3;
  const rating=c.rating?+c.rating:parT;
  const full=(+p.index)*(r.holes/18)*slope/113+(rating-parT);
  return Math.round(full*hcpPct(rid)/100); // tournament allowance (Setup → Handicap allowance, default 90%; Mountain Top R5 has its own, default 40%)
}
function pctOf(v,d){return v==null||v===''||isNaN(+v)?d:Math.max(0,Math.min(100,+v))}
function hcpPct(rid){const al=(settings&&settings.allow)||{};if(rid==='r5')return pctOf(al.hcpPctR5,40);return pctOf(al.hcpPct,90)}
function strokesOnHole(n,rid,h){ // n strokes (>=0) over the course
  const H=RBY[rid].holes;if(!n||n<=0)return 0;
  const base=Math.floor(n/H),rem=n%H;return base+(siOf(rid,h)<=rem?1:0);
}
// returns {sides:{PS:{players:[],docs:[],strokes:n,raw:x},IL:{...}}, low:x}
function matchStrokes(rid,mi){
  const r=RBY[rid],m=(pairings[rid]||[])[mi]||{};const out={};
  const chs={};['PS','IL'].forEach(t=>{(m[t]||[]).forEach(pid=>{chs[pid]=courseHcp(pid,rid)})});
  if(TEAMBALL(r.format)){
    const al=(settings&&settings.allow)||{};
    const raw={};['PS','IL'].forEach(t=>{const ps=(m[t]||[]).filter(p=>chs[p]!=null);if(ps.length<2){raw[t]=null;return}
      const a=Math.min(chs[ps[0]],chs[ps[1]]),b=Math.max(chs[ps[0]],chs[ps[1]]);
      raw[t]=r.format==='scramble'?(+al.scrambleLow||35)/100*a+(+al.scrambleHigh||15)/100*b:(+al.altshot||50)/100*(a+b)});
    const vals=Object.values(raw).filter(v=>v!=null);const low=vals.length?Math.min(...vals):0;
    ['PS','IL'].forEach(t=>{out[t]={players:m[t]||[],docs:[`${rid}_m${mi}_${t}`],raw:raw[t],strokes:raw[t]==null?0:Math.round(raw[t]-low),per:{}}});
    return out;
  }
  const vals=Object.values(chs).filter(v=>v!=null);const low=vals.length?Math.min(...vals):0;
  ['PS','IL'].forEach(t=>{const per={};(m[t]||[]).forEach(pid=>{per[pid]=chs[pid]==null?0:chs[pid]-low});
    out[t]={players:m[t]||[],docs:(m[t]||[]).map(pid=>`${rid}_${pid}`),per,strokes:null}});
  return out;
}
function gross(docKey,h){const d=scores[docKey];const v=d&&d.holes&&d.holes[h];return (v===undefined||v===null||v==='')?null:+v}
function capped(g,par,getsStroke){const mx=par+(getsStroke?4:3);return Math.min(g,mx)}
// side net on a hole; null if incomplete
function sideNet(rid,mi,ms,t,h){
  const r=RBY[rid],s=ms[t];const par=parOf(rid,h);
  if(TEAMBALL(r.format)){const g=gross(s.docs[0],h);if(g==null)return null;const st=strokesOnHole(s.strokes,rid,h);return capped(g,par,st>0)-st}
  const nets=[];for(const pid of s.players){const g=gross(`${rid}_${pid}`,h);if(g==null){if(r.format==='bestball')continue;return null}
    const st=strokesOnHole(s.per[pid],rid,h);nets.push(capped(g,par,st>0)-st)}
  if(!nets.length)return null;
  if(r.format==='both')return nets.length===s.players.length?nets[0]+nets[1]:null;
  return Math.min(...nets);
}
function computeMatch(rid,mi){
  const r=RBY[rid],ms=matchStrokes(rid,mi),m=(pairings[rid]||[])[mi];
  const res={ms,holes:[],segs:{},pts:{PS:0,IL:0},set:!!(m&&(m.PS||[]).length&&(m.IL||[]).length)};
  for(let h=1;h<=r.holes;h++){const a=sideNet(rid,mi,ms,'PS',h),b=sideNet(rid,mi,ms,'IL',h);
    let w=null;if(a!=null&&b!=null)w=a<b?'PS':b<a?'IL':'T';res.holes.push({h,PS:a,IL:b,w})}
  for(const [k,label,from,to,pts] of r.segs){
    const hs=res.holes.filter(x=>x.h>=from&&x.h<=to);const played=hs.filter(x=>x.w);const complete=played.length===hs.length&&hs.length>0;
    let diff=0,status='';
    if(r.format==='stroke'){const tPS=played.reduce((s,x)=>s+x.PS,0),tIL=played.reduce((s,x)=>s+x.IL,0);diff=tIL-tPS; // positive = PS ahead
      status=played.length?`${tPS}–${tIL} net thru ${played.length}`:''}
    else{diff=played.reduce((s,x)=>s+(x.w==='PS'?1:x.w==='IL'?-1:0),0);
      status=played.length?(diff===0?`All square thru ${played.length}`:`${diff>0?'PS':'IL'} ${Math.abs(diff)} up thru ${played.length}`):''}
    // match play closes out early when the lead exceeds the holes left in the segment
    let closed=false;const left=hs.length-played.length;
    if(r.format!=='stroke'&&!complete&&played.length&&Math.abs(diff)>left){closed=true;status=`${diff>0?'PS':'IL'} ${Math.abs(diff)}&${left}`}
    if(r.format!=='stroke'&&complete&&diff!==0)status=`${diff>0?'PS':'IL'} ${Math.abs(diff)} up`;
    const done=complete||closed;
    let w=null;if(done)w=diff>0?'PS':diff<0?'IL':'T';
    const seg={k,label,pts,from,to,complete:done,closed,played:played.length,total:hs.length,diff,status,w};
    if(w==='PS')res.pts.PS+=pts;else if(w==='IL')res.pts.IL+=pts;else if(w==='T'){res.pts.PS+=pts/2;res.pts.IL+=pts/2}
    res.segs[k]=seg;
  }
  return res;
}
function roundPts(rid){const t={PS:0,IL:0};for(let i=0;i<RBY[rid].matches;i++){const c=computeMatch(rid,i);t.PS+=c.pts.PS;t.IL+=c.pts.IL}return t}
function fmtPts(n){return n%1?n.toFixed(1):String(n)}
function pname(pid,short){const p=players[pid];if(!p)return '—';if(!short)return p.name;const parts=p.name.split(' ');return parts[0][0]+'. '+parts.slice(1).join(' ')}
function teamOf(pid){const t=(players[pid]||{}).team;return t==='PS'||t==='IL'?t:''}

// ---------- status strip: clock (Ridgedale, MO = Central), weather, sponsor ----------
let weather=null,sponsor=null,bets={};
function tickStrip(){try{$('#clock').textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date())+' CT'}catch(e){}
  const w=weather;$('#wx').textContent='Ridgedale, MO'+(w&&w.summary?` · ${w.temp!=null?Math.round(w.temp)+'°F ':''}${w.summary}${w.wind?' · wind '+w.wind:''}`:'')+(w&&w.updatedAt?'':'');
  const s=sponsor,a=$('#sponTop');const show=!!(s&&s.imageId);a.hidden=!show;document.documentElement.classList.toggle('has-spon',show);
  if(show){const im=a.querySelector('img');const src=`${esc(s.imageId)}`;if(im.getAttribute('src')!==src)im.src=src;im.alt=s.name||'Sponsor';a.title=s.name||'';if(s.url){a.href=s.url;a.target='_blank';a.rel='noopener'}else{a.removeAttribute('href')}}}
let logos=null;
function applyLogos(){const L=logos||{};const r=document.documentElement;const c=$('#crest');
  if(L.event){const src=`${esc(L.event)}`;if(c.getAttribute('src')!==src)c.src=src;c.hidden=false}else c.hidden=true;
  r.style.setProperty('--logo-ps',L.PS?`url(${esc(L.PS)})`:'none');r.style.setProperty('--logo-il',L.IL?`url(${esc(L.IL)})`:'none');
  r.classList.toggle('has-marks',!!(L.PS||L.IL))}
function courseLogo(rid){const L=logos||{};return L[rid]?`${esc(L[rid])}`:''}
// On-course competition sponsors: config/comps {longestPutt|longestDrive|ctp:{name,url,imageId}} → linked logo chips on the round that hosts the prize.
const COMPS=[['longestPutt','Longest Putt','r1',18],['longestDrive','Longest Drive','r6',1],['ctp','Closest to the Pin','r6',19],['mvp','Tournament MVP','',0]];
let csponsors=null;
function compChip(k,withLabel){const c=(csponsors||{})[k];if(!c||!c.imageId)return '';const d=COMPS.find(x=>x[0]===k);const src=`${esc(c.imageId)}`;const lbl=withLabel&&d?`<span>${esc(d[1])} · H${d[3]}</span>`:'';const href=c.url?` href="${esc(c.url)}" target="_blank" rel="noopener"`:'';return `<a class="cspon"${href} title="${esc((d?d[1]+' · ':'')+(c.name||''))}"><img src="${src}" alt="${esc(c.name||'')}">${lbl}</a>`}
function roundComps(rid,withLabel){const h=COMPS.filter(x=>x[2]===rid).map(x=>compChip(x[0],withLabel)).join('');return h?`<div class="cspons">${h}</div>`:''}
function teamMark(t,h){const L=logos||{};return L[t]?`<img src="${esc(L[t])}" alt="" style="height:${h||18}px;width:auto;vertical-align:-4px;margin-right:4px">`:''}
setInterval(tickStrip,30000);

// ---------- round highlights (auto press notes) ----------
function roundHighlights(rid){
  const r=RBY[rid];const names={'-3':'Albatross','-2':'Eagle','-1':'Birdie','2':'Double','3':'Triple','4':'Quad+'};
  const good={'-3':[],'-2':[],'-1':[]},bad={'2':[],'3':[],'4':[]};
  const who=TEAMBALL(r.format)?null:true;
  for(let i=0;i<r.matches;i++){const m=(pairings[rid]||[])[i];if(!m)continue;
    ['PS','IL'].forEach(t=>{const ents=TEAMBALL(r.format)?[{key:`${rid}_m${i}_${t}`,label:(m[t]||[]).map(p=>pname(p,true)).join('/')}]:(m[t]||[]).map(p=>({key:`${rid}_${p}`,label:pname(p,true)}));
      ents.forEach(e=>{const d=scores[e.key];if(!d||!d.holes)return;Object.keys(d.holes).forEach(h=>{const diff=+d.holes[h]-parOf(rid,+h);if(diff<=-1)good[String(Math.max(diff,-3))].push({label:e.label,h:+h});else if(diff>=2)bad[String(Math.min(diff,4))].push({label:e.label,h:+h,diff})})})})}
  const sg=snakeGroups().filter(g=>g.rid===rid);
  // closest / biggest result
  const results=[];for(let i=0;i<r.matches;i++){const c=computeMatch(rid,i);if(!c.set)continue;const ov=c.segs.overall;if(ov.played)results.push({i,ov})}
  return {good,bad,names,sg,results};
}
function fmtGroup(list){const by={};list.forEach(x=>{(by[x.label]=by[x.label]||[]).push(x.h)});return Object.keys(by).map(k=>`${k} (${by[k].sort((a,b)=>a-b).join(', ')})`).join(' · ')}
function highlightsHtml(rid){
  const H=roundHighlights(rid);const boxes=[];
  ['-3','-2','-1'].forEach(k=>{if(H.good[k].length)boxes.push(`<div class="box good"><div class="k">${H.names[k]}${H.good[k].length>1?'s':''} · ${H.good[k].length}</div>${esc(fmtGroup(H.good[k]))}</div>`)});
  const blow=[...H.bad['4'],...H.bad['3'],...H.bad['2']];if(blow.length)boxes.push(`<div class="box bad"><div class="k">Blow-up holes · ${blow.length}</div>${esc(['4','3','2'].filter(k=>H.bad[k].length).map(k=>H.names[k]+': '+fmtGroup(H.bad[k])).join(' | '))}</div>`);
  if(H.sg.length)boxes.push(`<div class="box"><div class="k">Snake</div>${esc(H.sg.map(g=>`M${g.mi+1}: ${pname(g.holder)} holds after ${g.tps.length} three-putt${g.tps.length===1?'':'s'}`).join(' · '))}</div>`);
  if(H.results.length){const sorted=[...H.results].sort((a,b)=>Math.abs(b.ov.diff)-Math.abs(a.ov.diff));const big=sorted[0],close=sorted[sorted.length-1];
    boxes.push(`<div class="box"><div class="k">Matches</div>Biggest margin: M${big.i+1} (${esc(big.ov.status)})${sorted.length>1?` · Tightest: M${close.i+1} (${esc(close.ov.status)})`:''}</div>`)}
  if(!boxes.length)return '<div class="foot">Highlights appear as scores come in: eagles, birdies, blow-up holes, the Snake, biggest and tightest match.</div>';
  const n=k=>H.good[k].length;const blowN=H.bad['2'].length+H.bad['3'].length+H.bad['4'].length;
  const parts=[];if(n('-3'))parts.push(`<b class="g">${n('-3')}</b> albatross${n('-3')>1?'es':''}`);if(n('-2'))parts.push(`<b class="g">${n('-2')}</b> eagle${n('-2')>1?'s':''}`);if(n('-1'))parts.push(`<b class="g">${n('-1')}</b> birdie${n('-1')>1?'s':''}`);if(blowN)parts.push(`<b class="w">${blowN}</b> blow-up${blowN>1?'s':''}`);
  if(H.sg.length===1)parts.push(`Snake: <b>${esc(pname(H.sg[0].holder,true))}</b>`);else if(H.sg.length>1)parts.push(`Snakes: <b>${H.sg.length}</b> groups`);
  let openSet={};try{openSet=JSON.parse(localStorage.getItem('sc_recap')||'{}')}catch(e){}
  return `<details class="recap" data-recap="${rid}" ${openSet[rid]?'open':''}><summary class="strip"><span>${parts.join(' · ')||'Round recap'}</span><span class="car">▾</span></summary><div class="body"><div class="hl">${boxes.join('')}</div></div></details>`;
}


// ---------- rendering ----------
function render(){renderTally();(({live:renderLive,cup:renderCup})[tab]||renderCup)();}

// ---------- live (phone) view ----------
const DAYS=[{k:'thu',label:'Thu 22',date:'2026-10-22',rounds:['r1','r2']},{k:'fri',label:'Fri 23',date:'2026-10-23',rounds:['r3','r4']},{k:'sat',label:'Sat 24',date:'2026-10-24',rounds:['r5','r6']}];
let liveDay=null;
function todayKey(){try{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const f=DAYS.find(x=>x.date===d);if(f)return f.k;if(d<DAYS[0].date)return 'thu';return 'sat'}catch(e){return 'thu'}}
function renderLive(){
  if(!liveDay)liveDay=todayKey();
  $('#dayChips').innerHTML=DAYS.map(d=>`<button class="chip ${d.k===liveDay?'on':''}" data-day="${d.k}">${d.label}</button>`).join('');
  const day=DAYS.find(d=>d.k===liveDay);let h='';
  day.rounds.forEach(rid=>{const r=RBY[rid];const p=roundPts(rid);
    h+=`<div class="lv-round" data-course="${rid}"><div class="lv-head"><div class="lhs">${courseLogo(rid)?`<span class="cmark" style="--mark:url(${courseLogo(rid)})" aria-hidden="true"></span>`:''}<div class="t">R${r.n} · ${esc(r.course.replace(' Par 3',''))}<small>${esc(r.fmt)}</small></div></div>${roundComps(rid,true)}<div class="sc num"><span class="tmark ps sm" aria-hidden="true"></span><span class="p">${fmtPts(p.PS)}</span><span class="d">–</span><span class="i">${fmtPts(p.IL)}</span><span class="tmark il sm" aria-hidden="true"></span></div></div>`;
    for(let i=0;i<r.matches;i++){const c=computeMatch(rid,i);const m=(pairings[rid]||[])[i]||{};
      if(!c.set){h+=`<div class="lv-m"><div class="n" style="color:var(--muted)">Match ${i+1}</div><div class="st"><div class="thru">Pairing not set</div></div><div></div></div>`;continue}
      const ov=c.segs.overall;const played=ov.played;
      let big='',cls='',thru='';
      if(ov.complete){big=ov.w==='T'?'HALVED':(ov.w==='PS'?'PS WIN':'IL WIN');cls=ov.w==='T'?'':ov.w.toLowerCase();
        thru=ov.w==='T'?'Final':(r.format==='stroke'?`by ${Math.abs(ov.diff)} net · Final`:(ov.closed?`${Math.abs(ov.diff)}&${ov.total-ov.played} · Final`:`${Math.abs(ov.diff)} up · Final`))}
      else if(!played){big='—';thru=m.tee?`Tee ${esc(m.tee)}`:'Not started'}
      else if(r.format==='stroke'){const d=ov.diff;big=d===0?'EVEN':`${d>0?'PS':'IL'} +${Math.abs(d)}`;cls=d>0?'ps':d<0?'il':'';thru=`net · thru ${played}`}
      else{const d=ov.diff;big=d===0?'A/S':`${d>0?'PS':'IL'} ${Math.abs(d)} UP`;cls=d>0?'ps':d<0?'il':'';thru=`thru ${played}`}
      const lead=ov.complete?(ov.w==='PS'?'lead-ps':ov.w==='IL'?'lead-il':''):(ov.diff>0?'lead-ps':ov.diff<0?'lead-il':'');
      const pts=Object.values(c.segs).map(s=>`<i class="${s.complete?(s.w==='T'?'t':s.w.toLowerCase()):''}" title="${esc(s.label)}"></i>`).join('');
      h+=`<div class="lv-m ${lead}"><div class="n ps">${(m.PS||[]).map(x=>esc(pname(x,true))).join('<br>')}</div><div class="st"><div class="big ${cls}">${big}</div><div class="thru">${thru}</div><div class="pts">${pts}</div></div><div class="n il">${(m.IL||[]).map(x=>esc(pname(x,true))).join('<br>')}</div></div>`}
    h+='</div>'});
  h+=`<div class="lv-foot"><span>Bars under each match: front · back · overall</span><span id="liveClock"></span></div>`;
  $('#liveArea').innerHTML=h;tickClock();
}
let clockT=null;function tickClock(){const el=$('#liveClock');if(!el)return;el.textContent='Updated '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
// keep the phone awake while the live view is showing
let wake=null;async function wakeLock(on){try{if(on&&!wake&&navigator.wakeLock){wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',()=>{wake=null})}else if(!on&&wake){await wake.release();wake=null}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&tab==='live')wakeLock(true)});
function renderTally(){const t={PS:0,IL:0};ROUNDS.forEach(r=>{const p=roundPts(r.id);t.PS+=p.PS;t.IL+=p.IL});
  $('#tPS').textContent=fmtPts(t.PS);$('#tIL').textContent=fmtPts(t.IL);const left=72-t.PS-t.IL;
  $('#tMid').innerHTML=left>0?`${fmtPts(left)} PTS<br>LEFT`:(t.PS>t.IL?'PIN SEEKERS<br>WIN THE CUP':t.IL>t.PS?'IRON LEGENDS<br>WIN THE CUP':'TIED<br>TIEBREAKER');
  $('#bPS').style.width=(t.PS/72*100)+'%';$('#bIL').style.width=(t.IL/72*100)+'%';}

function renderCup(){
  let b='<div></div>'+ROUNDS.map(r=>`<div class="hd">R${r.n}<br><span style="font-weight:400">${esc(r.course.replace(' Par 3',''))}</span></div>`).join('')+'<div class="hd">Total</div>';
  const tot={PS:0,IL:0};const rows={PS:'',IL:''};
  ROUNDS.forEach(r=>{const p=roundPts(r.id);tot.PS+=p.PS;tot.IL+=p.IL;rows.PS+=`<div class="num">${fmtPts(p.PS)}</div>`;rows.IL+=`<div class="num">${fmtPts(p.IL)}</div>`});
  b+=`<div class="lbl tag-ps">${teamMark('PS')}Pin Seekers</div>${rows.PS}<div class="tot num tag-ps">${fmtPts(tot.PS)}</div>`;
  b+=`<div class="lbl tag-il">${teamMark('IL')}Iron Legends</div>${rows.IL}<div class="tot num tag-il">${fmtPts(tot.IL)}</div>`;
  $('#board').innerHTML=b;
  // rounds
  let h='';ROUNDS.forEach(r=>{const p=roundPts(r.id);h+=`<div class="card cup-round"><div class="rhead"><h2>${courseLogo(r.id)?`<img class="clogo" src="${courseLogo(r.id)}" alt="">`:''}Round ${r.n} · ${esc(r.course)}</h2>${roundComps(r.id,true)}<div class="rscore"><span class="pill ps ${p.PS>p.IL?'lead':''}" aria-label="Pin Seekers ${fmtPts(p.PS)}">${teamMark('PS',16)||'PS '}${fmtPts(p.PS)}</span><span class="pill il ${p.IL>p.PS?'lead':''}" aria-label="Iron Legends ${fmtPts(p.IL)}">${teamMark('IL',16)||'IL '}${fmtPts(p.IL)}</span></div></div><div class="eyebrow" style="margin-bottom:8px">${esc(r.fmt)} · ${r.day}</div><div class="matchgrid">`;
    for(let i=0;i<r.matches;i++){const c=computeMatch(r.id,i);const m=(pairings[r.id]||[])[i]||{};
      if(!c.set){h+=`<div class="mcard"><div class="eyebrow">Match ${i+1}</div><div class="empty" style="margin-top:6px">Pairing not set</div></div>`;continue}
      h+=`<div class="mcard"><div class="eyebrow">Match ${i+1}${m.tee?` · Tee ${esc(m.tee)}`:''}</div><div class="who"><div class="ps">${(m.PS||[]).map(p=>esc(pname(p,true))).join('<br>')}</div><div class="vs">VS</div><div class="il">${(m.IL||[]).map(p=>esc(pname(p,true))).join('<br>')}</div></div><div class="segs">`;
      for(const s of Object.values(c.segs)){const cls=s.w==='PS'?'w-ps':s.w==='IL'?'w-il':'';const v=s.complete?(s.w==='T'?'½ – ½':s.w==='PS'?`PS +${s.pts}`:`IL +${s.pts}`):(s.played?`${s.played}/${s.total}`:'—');h+=`<div class="seg ${cls}"><div class="k">${esc(s.label)}</div><div class="v">${v}</div></div>`}
      const ov=c.segs.overall;h+=`</div><div class="stand">${esc(ov.status||'Not started')}</div></div>`}
    h+='</div>'+highlightsHtml(r.id)+'</div>'});
  $('#cupRounds').innerHTML=h;
  // ---------- player stats + MVP race ----------
  // Cup points: every point a side wins is credited in full to each player on that side.
  // Individual play (R1 both-count, R4 best ball, R5 stroke, R6 singles): every hole the player posted, gross and
  // net to par off his own full course handicap (hole cap: triple bogey, quad when receiving), so players compare fairly.
  // Team play (R2 scramble, R3 alt shot): the side's score to par, net of the full team allowance, shared by both partners.
  // Tournament MVP: most Cup points won (every point a player's side wins in his matches). Nothing else counts,
  // except as the one tiebreak: the aggregate (personal net R1, R4, R5, R6 + team score R2, R3, to par), lowest wins.
  const stats={};Object.keys(players).forEach(p=>stats[p]={pts:0,w:0,l:0,t:0,tp:0,holes:0,gross:0,net:0,eag:0,bird:0,par:0,bog:0,dbl:0,mvp:0,mvpHoles:0,team:0,teamHoles:0,rounds:{}});
  const hcpStrokes=(ch,rid,h)=>{if(!ch)return 0;if(ch>0)return strokesOnHole(ch,rid,h);const H=RBY[rid].holes;return siOf(rid,h)>H+ch?-1:0};
  ROUNDS.forEach(r=>{for(let i=0;i<r.matches;i++){const c=computeMatch(r.id,i);const m=(pairings[r.id]||[])[i];if(!m)continue;
    ['PS','IL'].forEach(t=>{(m[t]||[]).forEach(pid=>{const S=stats[pid];if(!S)return;
      if(c.set){S.pts+=c.pts[t];const ov=c.segs.overall;if(ov.complete){if(ov.w===t)S.w++;else if(ov.w==='T')S.t++;else S.l++}}
      const R={pts:c.set?c.pts[t]:0,team:TEAMBALL(r.format),holes:0,gross:0,net:0};
      if(TEAMBALL(r.format)){const key=`${r.id}_m${i}_${t}`,d=scores[key];const raw=matchStrokes(r.id,i)[t].raw;const tch=raw==null?0:Math.round(raw);
        if(d&&d.holes)Object.keys(d.holes).forEach(h=>{h=+h;const g=gross(key,h);if(g==null)return;const par=parOf(r.id,h);const st=hcpStrokes(tch,r.id,h);
          R.holes++;R.gross+=g-par;R.net+=capped(g,par,st>0)-st-par});
        S.team+=R.net;S.teamHoles+=R.holes}
      else{const key=`${r.id}_${pid}`,d=scores[key];const ch=courseHcp(pid,r.id);
        if(d&&d.holes)Object.keys(d.holes).forEach(h=>{h=+h;const g=gross(key,h);if(g==null)return;const par=parOf(r.id,h);const st=hcpStrokes(ch,r.id,h);const nt=capped(g,par,st>0)-st;
          R.holes++;R.gross+=g-par;R.net+=nt-par;const dd=g-par;if(dd<=-2)S.eag++;else if(dd===-1)S.bird++;else if(dd===0)S.par++;else if(dd===1)S.bog++;else S.dbl++});
        if(d&&d.tp)S.tp+=Object.values(d.tp).filter(Boolean).length;
        S.holes+=R.holes;S.gross+=R.gross;S.net+=R.net}
      S.mvp+=R.net;S.mvpHoles+=R.holes;S.rounds[r.id]=R})})}});
  const mul=side.mulligans||{};
  const toPar=n=>n===0?'E':(n>0?'+'+n:String(n));
  const mulUsed=p=>mul[p]&&mul[p].used?1:0;
  const list=Object.keys(players).sort((a,b)=>stats[b].pts-stats[a].pts||(stats[b].mvpHoles>0)-(stats[a].mvpHoles>0)||stats[a].mvp-stats[b].mvp||players[a].name.localeCompare(players[b].name));
  const anyPlay=list.some(p=>stats[p].pts>0||stats[p].mvpHoles);
  $('#mvpHead').innerHTML=`${compChip('mvp',false)}<div><div class="eyebrow" style="margin:0">MVP race</div><div class="foot" style="margin:2px 0 0">Most Cup points wins: every point your side wins in your matches counts for you. Tiebreak: lowest aggregate to par (personal net in R1, R4, R5, R6 + team gross in R2, R3).</div></div>`;
  $('#ptally').innerHTML='<tr><th class="c">#</th><th>Player</th><th>Team</th><th class="r" title="Cup points won in your matches (MVP ranking)">Pts</th><th class="c" title="Tiebreak only: personal net (R1, R4, R5, R6) + team score (R2, R3), to par">Agg</th><th class="c" title="Personal net, R1, R4, R5, R6">Indiv</th><th class="c" title="Team gross, R2 and R3">Team</th><th class="c">W-L-H</th><th class="c" title="Personal gross, R1, R4, R5, R6">Gross</th><th class="c">Holes</th><th class="c" title="Birdies or better">Bird+</th><th class="c">Par</th><th class="c">Bog</th><th class="c">Dbl+</th><th class="c" title="3-putts in individual rounds">Snakes</th><th class="c">Mulligan</th></tr>'+
    list.map((p,ix)=>{const S=stats[p];const lead=anyPlay&&ix===0;return `<tr class="${lead?'mvp-lead':''}"><td class="c num">${anyPlay?ix+1:'—'}</td><td>${lead?'<span class="mvp-crown" title="Current MVP leader">★</span> ':''}${esc(players[p].name)}${players[p].captain?' <span class="pill wait">C</span>':''}</td><td><span class="pill ${teamOf(p).toLowerCase()}">${teamOf(p)||'—'}</span></td><td class="r num"><b>${fmtPts(S.pts)}</b></td><td class="c num">${S.mvpHoles?toPar(S.mvp):'—'}</td><td class="c num">${S.holes?toPar(S.net):'—'}</td><td class="c num">${S.teamHoles?toPar(S.team):'—'}</td><td class="c num">${S.w}-${S.l}-${S.t}</td><td class="c num">${S.holes?toPar(S.gross):'—'}</td><td class="c num">${S.holes||'—'}</td><td class="c num">${S.eag+S.bird||'—'}</td><td class="c num">${S.par||'—'}</td><td class="c num">${S.bog||'—'}</td><td class="c num">${S.dbl||'—'}</td><td class="c num">${S.tp}</td><td class="c">${mul[p]&&mul[p].used?'Used':'Available'}</td></tr>`}).join('');
  $('#pround').innerHTML='<tr><th>Player</th>'+ROUNDS.map(r=>`<th class="c">R${r.n}<br><span class="rsub">${esc(r.course.replace(' Par 3',''))}</span><br><span class="rsub">${r.gross?'team gross':'net · gross'}</span></th>`).join('')+'</tr>'+
    list.map(p=>`<tr><td>${esc(pname(p,true))}</td>`+ROUNDS.map(r=>{const R=stats[p].rounds[r.id];if(!R)return '<td class="c muted">—</td>';
      const pts=R.pts?`<div class="rp">${fmtPts(R.pts)} pt${R.pts===1?'':'s'}</div>`:'';
      if(!R.holes)return `<td class="c">${pts||'<span class="muted">—</span>'}</td>`;
      return `<td class="c num"><b>${toPar(R.net)}</b>${r.gross?'':' · '+toPar(R.gross)}<div class="rh">${R.holes} holes</div>${pts}</td>`}).join('')+'</tr>').join('');
}



function snakeGroups(){ // per round, per match: list of three-putts
  const out=[];const rate=+((settings&&settings.snake&&settings.snake.rate)||1);
  ROUNDS.forEach(r=>{for(let i=0;i<r.matches;i++){const m=(pairings[r.id]||[])[i];if(!m)continue;const group=[...(m.PS||[]),...(m.IL||[])];if(!group.length)continue;
    const tps=[];group.forEach(pid=>{const d=scores[`${r.id}_${pid}`];if(d&&d.tp)Object.keys(d.tp).forEach(h=>{if(d.tp[h])tps.push({pid,h:+h})})});
    if(!tps.length)continue;tps.sort((a,b)=>a.h-b.h);const holder=tps[tps.length-1].pid;
    out.push({rid:r.id,n:r.n,course:r.course,mi:i,group,tps,holder,owes:tps.length*group.length*rate})}});
  return out;
}


// ---------- events ----------
document.addEventListener('click',e=>{
  const tb=e.target.closest('#tabs button');if(tb){tab=tb.dataset.tab;try{tb.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})}catch(x){}document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b===tb));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id==='p-'+tab));try{localStorage.setItem('sc_tab',tab)}catch(x){}wakeLock(tab==='live');render();return}
  const dc=e.target.closest('[data-day]');if(dc){liveDay=dc.dataset.day;renderLive();return}
});
document.addEventListener('toggle',e=>{const d=e.target;if(!d.dataset||!d.dataset.recap)return;let o={};try{o=JSON.parse(localStorage.getItem('sc_recap')||'{}')}catch(x){}o[d.dataset.recap]=d.open;try{localStorage.setItem('sc_recap',JSON.stringify(o))}catch(x){}},true);
// ---------- persistence ----------
const pending={};const timers={};
const patches={};
function mergePatch(a,b){for(const k in b){a[k]=(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k]))?mergePatch(a[k]&&typeof a[k]==='object'?a[k]:{},b[k]):b[k]}return a}
// patch: the fields that changed (cleared values as null) — sent with update() so concurrent editors of one doc never overwrite each other
function queueWrite(path,data,patch){if(!db)return;pending[path]=data;if(patch)patches[path]=mergePatch(patches[path]||{},patch);clearTimeout(timers[path]);timers[path]=setTimeout(()=>flush(path),450);const m=$('#saveMsg');if(m)m.textContent='Saving…'}
const inflight={};
async function flush(path){if(!db||inflight[path]){timers[path]=setTimeout(()=>flush(path),300);return}const data=pending[path],patch=patches[path];delete pending[path];delete patches[path];inflight[path]=true;
  try{const ref=db.doc(path);
    if(patch){try{await ref.update(JSON.parse(JSON.stringify(patch)))}catch(e){if(e&&e.code==='invalid_argument'&&!(scores[path.slice(7)]&&scores[path.slice(7)].__seen)){const c=JSON.parse(JSON.stringify(data));delete c.__seen;await ref.set(c)}else throw e}}
    else{const c=JSON.parse(JSON.stringify(data));delete c.__seen;await ref.set(c)}
    const m=$('#saveMsg');if(m)m.textContent='Saved · live for everyone'}
  catch(e){const m=$('#saveMsg');if(e&&e.code==='invalid_argument'&&canWrite!==true){canWrite=false;setStatus('This view is read-only. Ask Alan to add you as a Contributor or Editor so you can enter scores.');render()}else if(m)m.textContent='Could not save ('+((e&&e.code)||'error')+'). Try again.'}
  finally{inflight[path]=false}}
function setStatus(msg,ok){$('#status').innerHTML=msg?`<div class="notice ${ok?'ok':''}">${esc(msg)}</div>`:''}

function tabCue(){const n=$('#tabs'),w=$('#tabwrap');if(!n||!w)return;const more=n.scrollWidth>n.clientWidth+1;w.classList.toggle('more',more&&n.scrollLeft+n.clientWidth<n.scrollWidth-2);w.classList.toggle('more-l',more&&n.scrollLeft>2)}

// ---------- boot ----------
document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));tabCue();addEventListener('resize',tabCue);$('#tabs').addEventListener('scroll',tabCue,{passive:true});const _on=document.querySelector('#tabs button.on');if(_on)try{_on.scrollIntoView({block:'nearest',inline:'nearest'})}catch(x){}document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id==='p-'+tab));
render();tickStrip();if(tab==='live')wakeLock(true);
setStatus('Loading scores…');
// data.json is untrusted: only same-origin logo paths and https sponsor links get anywhere near src/href/url().
const SAFE_IMG=/^logos\/[a-z0-9_-]+\.png$/;
const safePath=v=>typeof v==='string'&&SAFE_IMG.test(v)?v:'';
const safeUrl=v=>typeof v==='string'&&/^https:\/\//.test(v)?v:'';
const safeLogos=o=>{const out={};if(o&&typeof o==='object')Object.keys(o).forEach(k=>{const v=safePath(o[k]);if(v)out[k]=v});return out};
const safeSponsor=o=>o&&typeof o==='object'?{name:String(o.name||''),url:safeUrl(o.url),imageId:safePath(o.imageId)}:null;
const safeComps=o=>{const out={};if(o&&typeof o==='object')Object.keys(o).forEach(k=>{const c=safeSponsor(o[k]);if(c&&c.imageId)out[k]=c});return out};
const POLL_MS=Math.max(1000,+(new URLSearchParams(location.search).get('poll'))||60000);
let lastText='';
async function pull(){
  try{
    const r=await fetch('data.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const text=await r.text();if(text===lastText)return;lastText=text;
    const d=JSON.parse(text);
    players=d.players||{};settings=d.settings||null;pairings=d.pairings||{};scores=d.scores||{};side=d.side||{};
    sponsor=safeSponsor(d.sponsor);logos=safeLogos(d.logos);csponsors=safeComps(d.compSponsors);
    applyLogos();tickStrip();render();setStatus('');
    const n=$('#syncNote');if(n&&d.updatedAt){try{n.textContent=' · scores as of '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(d.updatedAt))+' CT'+(Array.isArray(d.stale)&&d.stale.length?' (partial refresh)':'')}catch(e){}}
  }catch(e){if(!lastText)setStatus('Scores are not available right now. Refresh in a minute.')}
}
pull();setInterval(pull,POLL_MS);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pull()});
})();
