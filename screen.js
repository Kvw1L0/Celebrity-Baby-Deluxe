import { $, onValue, roomRef, activeRef, now, background } from './live.js';
import { openRoom, remaining, escapeHTML } from './game-core.mjs';
const views=['closed','lobby','play','answer','ranking'];
let unsubscribe,data,lastFinal=0,currentPin='',lastRank='';
const joinOverlay=document.createElement('aside');
joinOverlay.className='hidden';joinOverlay.style.cssText='position:fixed;z-index:4;left:24px;bottom:24px;display:flex;align-items:center;gap:12px;padding:10px 14px;background:#090714e8;border:1px solid #fbbf24;border-radius:16px;box-shadow:0 0 28px #fbbf2466;text-align:left';
joinOverlay.innerHTML='<img alt="QR para unirse" style="width:78px;height:78px;background:#fff;border-radius:8px;padding:4px"><div><span style="font-size:10px;letter-spacing:.12em;color:#cbd5e1;font-weight:800">PIN DE SALA</span><b style="display:block;color:#fcd34d;font:900 28px Outfit,sans-serif;letter-spacing:.08em">----</b><p style="font-size:11px;color:#fff;margin:3px 0 0">Escanea para jugar</p></div>';
document.body.append(joinOverlay);const qrMini=joinOverlay.querySelector('img'),pinMini=joinOverlay.querySelector('b');
function view(name){views.forEach(v=>$(v).classList.toggle('hidden',v!==name));}
function closed(){data=null;lastFinal=0;lastRank='';view('closed');background();$('qr').removeAttribute('src');$('pin').textContent='----';$('people').replaceChildren();$('list').replaceChildren();$('confetti').replaceChildren();$('image').removeAttribute('src');$('answerImage').removeAttribute('src');}
onValue(activeRef,s=>{
  unsubscribe?.();unsubscribe=null;currentPin=s.val();closed();
  if(currentPin)unsubscribe=onValue(roomRef(currentPin),s=>{data=s.val();if(!openRoom(data))return closed();show();},closed);
},closed);
function show(){
  const q=data.pregunta_actual||{},c=data.config||{},players=Object.entries(data.jugadores||{});
  background(c);$('pin').textContent=currentPin;
  const join=c.joinUrl||new URL(`./?room=${currentPin}`,location.href).href;
  const qr='https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data='+encodeURIComponent(join);
  if($('qr').src!==qr)$('qr').src=qr;
  if(qrMini.src!==qr)qrMini.src=qr;pinMini.textContent=currentPin;
  $('playerCount').textContent=players.length;
  $('people').innerHTML=players.length?players.map(([,p])=>`<span class="person"><span class="avatar">${escapeHTML(p.avatar||p.nombre?.slice(0,2).toUpperCase())}</span>${escapeHTML(p.nombre)}</span>`).join(''):'<p class="empty-players">Esperando a que los jugadores escaneen el código QR…</p>';
  const state=data.estado;
  const target=data.showRanking||['ranking','final'].includes(state)?'ranking':['idle','playing','paused'].includes(state)&&q.image?'play':state==='revealed'?'answer':'lobby';
  joinOverlay.classList.toggle('hidden',target==='lobby'||!data.showJoinInfo);
  view(target);
  if(target==='play')build(q,'image','grid',false);
  if(target==='answer'){build(q,'answerImage','answerGrid',true);$('correct').textContent=q.opciones?.[q.correcta]||'';}
  if(target==='ranking')ranking(players,state==='final');
  clock();
}
function build(q,imageId,gridId,all){
  if(!q.image)return;
  const image=$(imageId),grid=$(gridId),n=q.gridSize||6,key=q.id+':'+(q.startTime||0)+':'+n;
  if(grid.dataset.key!==key){image.src=q.image;grid.dataset.key=key;grid.style.gridTemplateColumns=`repeat(${n},1fr)`;grid.innerHTML=Array.from({length:n*n},()=>'<i class="tile"></i>').join('');}
  [...grid.children].forEach((tile,i)=>tile.classList.toggle('reveal',all||(q.revealedBlocks||[]).includes(i)));
}
function clock(){if(!data)return;const q=data.pregunta_actual;$('clock').textContent=data.estado==='idle'?'Ronda lista':data.estado==='paused'?'Pausa':Math.ceil(remaining(q,now())/1000)+' segundos';}
setInterval(clock,250);
function ranking(players,final){
  const rows=players.sort((a,b)=>(b[1].puntaje||0)-(a[1].puntaje||0)||a[1].nombre.localeCompare(b[1].nombre));
  $('rankingTitle').textContent=final?'Podio final':'Ranking en vivo';$('podium').classList.toggle('hidden',!final||!rows.length);
  const winners=rows.filter(([,p])=>(p.puntaje||0)===(rows[0]?.[1].puntaje||0));
  $('winner').textContent=winners.map(([,p])=>p.nombre).join(' · ');$('winnerLabel').textContent=winners.length>1?'EMPATE EN PRIMER LUGAR':'GANADOR/A';
  const signature=JSON.stringify(rows);
  if(signature!==lastRank){
    const positions=new Map([...$('list').children].map(el=>[el.dataset.player,el.getBoundingClientRect().top]));
    let place=0,previous=-1;
    $('list').innerHTML=rows.map(([id,p],i)=>{if((p.puntaje||0)!==previous)place=i+1;previous=p.puntaje||0;return `<article class="rank glass" data-player="${escapeHTML(id)}"><span class="rank-place">${place}</span><b class="rank-name">${escapeHTML(p.avatar||'')} ${escapeHTML(p.nombre)}</b><span class="rank-points">${p.puntaje||0} pts</span></article>`;}).join('')||'<p class="hint">No hay jugadores inscritos.</p>';
    [...$('list').children].forEach(el=>{const old=positions.get(el.dataset.player);if(old!=null&&el.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)el.animate([{transform:`translateY(${old-el.getBoundingClientRect().top}px)`},{transform:'translateY(0)'}],{duration:700,easing:'cubic-bezier(.2,.8,.2,1)'});});lastRank=signature;
  }
  if(final&&data.finalizado!==lastFinal){lastFinal=data.finalizado;const colors=['#fbbf24','#fde68a','#fff','#ff4fa3'];$('confetti').innerHTML=Array.from({length:100},(_,i)=>`<i style="left:${Math.random()*100}%;background:${colors[i%colors.length]};animation-delay:${Math.random()*.7}s"></i>`).join('');}
}
$('fullscreen').onclick=()=>{const promise=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();promise?.catch(()=>{});};
closed();

