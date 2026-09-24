import { $, db, ref, get, set, onValue, transact, roomRef, activeRef, now } from './live.js';
import { openRoom, action, escapeHTML } from './game-core.mjs';
let pin = '', data = null, unsubscribe, busy = false, image64 = '', bg64 = '', tickBusy = false;
const value = id => $(id).value;
const say = text => { $('notice').textContent = text; $('welcomeNotice').textContent = text; };
// Keep the join invitation available as an optional on-screen overlay.
const joinToggle=document.createElement('label');
joinToggle.className='toggle wide';
joinToggle.innerHTML='<input id="showJoinInfo" type="checkbox"> Mostrar QR y PIN en la pantalla gigante';
$('autoAdvance').parentElement.before(joinToggle);
const joinUrl = () => new URL(`./?room=${pin}`, location.href).href;
function reset(message = 'Sala cerrada. Puedes crear una nueva.') {
  unsubscribe?.(); unsubscribe = null; data = null; pin = ''; image64 = ''; bg64 = '';
  sessionStorage.removeItem('cbAdminRoom');
  $('welcome').classList.remove('hidden'); $('dashboard').classList.add('hidden'); $('roomInfo').classList.add('hidden');
  ['photo','background','o0','o1','o2','o3'].forEach(id => $(id).value = '');
  $('preview').removeAttribute('src'); $('preview').style.display = 'none'; $('qr').removeAttribute('src');
  $('players').replaceChildren(); $('playlist').replaceChildren(); $('pin').textContent = '----';
  $('autoAdvance').checked = false; $('showJoinInfo').checked = false; $('size').value = '6'; $('time').value = '30'; $('order').value = 'random';
  document.querySelector('input[name=correct][value="0"]').checked = true;
  say(message);
}
function render() {
  if (!data) return;
  const rounds = data.rondas || [], current = data.ronda_actual || 0, state = data.estado;
  const running = ['playing','paused'].includes(state), final = state === 'final';
  $('roundIndicator').textContent = rounds.length ? `Ronda actual: ${current + 1} de ${rounds.length}` : 'Aún no hay rondas preparadas.';
  $('roomState').textContent = ({lobby:'Sala abierta',idle:'Ronda lista',playing:'En juego',paused:'En pausa',revealed:'Respuesta',final:'Final'})[state] || state;
  $('launch').textContent = `Lanzar ronda ${current + 1}`;
  $('launch').disabled = busy || state !== 'idle';
  $('pause').textContent = state === 'paused' ? 'Reanudar' : 'Pausar';
  $('pause').disabled = busy || !running;
  $('hint').disabled = busy || state !== 'playing';
  $('reveal').disabled = busy || !running;
  $('next').disabled = busy || running || final || current >= rounds.length - 1;
  $('end').disabled = busy || final;
  $('ranking').disabled = busy || final;
  $('ranking').textContent = data.showRanking ? 'Ocultar ranking' : 'Mostrar ranking';
  $('save').disabled = busy || final; $('skin').disabled = busy || final; $('close').disabled = busy;
  $('autoAdvance').checked = !!data.autoAdvance; $('autoAdvance').disabled = busy || final;
  $('showJoinInfo').checked = !!data.showJoinInfo; $('showJoinInfo').disabled = busy;
  $('playlist').innerHTML = rounds.length ? rounds.map((p,i) => `<button class="round ${i===current?'active':''}" data-round="${i}" ${busy||running||final||data.completed?.[p.id]?'disabled':''}><img src="${escapeHTML(p.image)}" alt=""><div><b>Ronda ${i+1}${i===current?' · actual':''}${data.completed?.[p.id]?' · jugada':''}</b><br><small>${escapeHTML(p.opciones[p.correcta])}</small></div></button>`).join('') : '<div class="empty">Aún no hay rondas preparadas.</div>';
  document.querySelectorAll('[data-round]').forEach(b => b.onclick = () => task(() => command('prepare',{index:+b.dataset.round})));
  const players = Object.values(data.jugadores || {});
  $('players').innerHTML = players.length ? players.map(p => `<div class="player"><span class="avatar">${escapeHTML(p.avatar || p.nombre?.slice(0,2))}</span><b>${escapeHTML(p.nombre)}</b><small style="margin-left:auto">${p.puntaje||0} pts</small></div>`).join('') : '<div class="empty">Esperando participantes…</div>';
}
async function task(fn) {
  if (busy) return;
  busy = true; $('create').disabled = true; render();
  try { await fn(); } catch (e) { say('No se pudo completar la acción. Revisa la conexión e inténtalo otra vez.'); console.error(e); }
  finally { busy = false; $('create').disabled = false; render(); }
}
async function change(fn) {
  if (!pin) throw new Error('Sin sala');
  const result = await transact(roomRef(pin), d => openRoom(d) ? fn(d) : undefined);
  if (!result.committed) throw new Error('La sala o la ronda cambió.');
  return result;
}
const command = (type,payload) => change(d => action(d,type,now(),payload));
function connect(code) {
  unsubscribe?.(); pin = code; sessionStorage.setItem('cbAdminRoom', pin);
  $('welcome').classList.add('hidden'); $('dashboard').classList.remove('hidden'); $('roomInfo').classList.remove('hidden');
  $('pin').textContent = pin; $('qr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(joinUrl());
  let first = true;
  unsubscribe = onValue(roomRef(pin), snap => {
    data = snap.val(); if (!openRoom(data)) return reset();
    if (first) { const c=data.config||{}; bg64=c.backgroundImage||''; for(const [id,key,fallback] of [['tile','tileColor','#7c4dff'],['bgcolor','backgroundColor','#999999'],['answerBg','answerBg','#ffd41f'],['answerText','answerText','#1d1600']]) $(id).value=c[key]||fallback; first=false; }
    render();
  }, e => { say('Se perdió el acceso a la sala. Revisa la conexión.'); console.error(e); });
}
$('create').onclick = () => task(async () => {
  const existing = (await get(activeRef)).val();
  if (existing && openRoom((await get(roomRef(existing))).val())) { connect(existing); say('Retomaste la sala que ya estaba abierta.'); return; }
  for (let attempt=0;attempt<30;attempt++) {
    const candidate = String(Math.floor(1000+Math.random()*9000));
    if ((await get(roomRef(candidate))).exists()) continue;
    // Explicit writes are deliberately used here: the current Firebase rules
    // accept normal room writes but may reject a root transaction on new data.
    await set(roomRef(candidate),{estado:'lobby',creador:now(),ronda_actual:0,rondas:[],jugadores:{},config:{tileColor:'#7c4dff',backgroundColor:'#999999',answerBg:'#ffd41f',answerText:'#1d1600'}});
    const verified=(await get(roomRef(candidate))).val();
    if(!openRoom(verified)) continue;
    await set(activeRef,candidate);
    connect(candidate); say('Sala creada. Comparte el QR para recibir participantes.'); return;
  }
  throw new Error('No se pudo asignar un PIN disponible.');
});
async function imageData(file,max=1100) {
  if (!file?.type.startsWith('image/')) throw new Error('Selecciona una imagen.');
  return new Promise((resolve,reject) => { const reader=new FileReader(); reader.onerror=reject; reader.onload=()=>{const img=new Image(); img.onerror=reject; img.onload=()=>{const ratio=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=img.width*ratio;canvas.height=img.height*ratio;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.8));};img.src=reader.result;};reader.readAsDataURL(file);});
}
$('photo').onchange = e => task(async()=>{if(!e.target.files[0])return;image64=await imageData(e.target.files[0]);$('preview').src=image64;$('preview').style.display='block';say('Foto lista. Completa las cuatro alternativas.');});
$('background').onchange = e => task(async()=>{if(e.target.files[0]){bg64=await imageData(e.target.files[0],1600);say('Fondo listo para aplicar.');}});
$('save').onclick = () => task(async()=>{
  const options=['o0','o1','o2','o3'].map(id=>value(id).trim());
  if(!image64||options.some(x=>!x)) return say('Falta la foto o alguna alternativa.');
  const round={id:'r_'+crypto.randomUUID(),image:image64,opciones:options,correcta:+document.querySelector('input[name=correct]:checked').value,gridSize:+value('size'),totalTimeSecs:+value('time'),revealOrder:value('order')};
  await change(d=>{if(d.estado==='final')return;d.rondas ||= [];d.rondas.push(round);if(d.rondas.length===1){d.ronda_actual=0;d.pregunta_actual={...round,revealedBlocks:[]};d.estado='idle';}return d;});
  ['o0','o1','o2','o3','photo'].forEach(id=>$(id).value='');image64='';$('preview').style.display='none';say('Ronda añadida sin interrumpir la ronda actual.');
});
$('skin').onclick=()=>task(async()=>{await change(d=>{d.config={tileColor:value('tile'),backgroundColor:value('bgcolor'),answerBg:value('answerBg'),answerText:value('answerText'),backgroundImage:bg64,joinUrl:joinUrl()};return d;});say('Estilo actualizado en todas las pantallas.');});
function shuffledOrder(q) { const a=Array.from({length:q.gridSize*q.gridSize},(_,i)=>i);if(q.revealOrder==='random')for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }
const launch = () => command('launch',{order:shuffledOrder(data.pregunta_actual)});
$('launch').onclick=()=>task(launch);
$('pause').onclick=()=>task(()=>command('pause'));
$('hint').onclick=()=>task(()=>command('hint'));
$('reveal').onclick=()=>task(()=>command('reveal'));
$('ranking').onclick=()=>task(()=>command('ranking'));
$('next').onclick=()=>task(()=>command('prepare',{index:(data.ronda_actual||0)+1}));
$('end').onclick=()=>task(async()=>{if(!confirm('¿Terminar el juego ahora y mostrar el podio con los puntos acumulados?'))return;await command('end');say('Juego terminado. Puedes mantener el podio o cerrar la sala.');});
$('autoAdvance').onchange=()=>{const checked=$('autoAdvance').checked;task(()=>change(d=>{d.autoAdvance=checked;return d;}));};
$('showJoinInfo').onchange=()=>{const checked=$('showJoinInfo').checked;task(async()=>{await change(d=>{d.showJoinInfo=checked;return d;});say(checked?'QR y PIN visibles en la pantalla gigante.':'QR y PIN ocultos en la pantalla gigante.');});};
$('close').onclick=()=>task(async()=>{
  if(!confirm('¿Cerrar la sala? Se eliminarán jugadores, puntos, respuestas, fotos y configuración de esta sesión. Todos volverán al inicio. Esta acción no se puede deshacer.'))return;
  const closingPin=pin;
  await command('close');
  // Never clear a different room opened by another host in the meantime.
  await transact(activeRef,current=>current===closingPin?null:undefined);
  reset('Sala cerrada: jugadores, rondas, puntos y configuración eliminados.');
});
$('copy').onclick=()=>task(async()=>{await navigator.clipboard.writeText(joinUrl());say('Enlace copiado.');});
// Timestamp-based progress survives reloads and prevents interval drift.
setInterval(async()=>{
  if(busy||tickBusy||!openRoom(data))return;
  tickBusy=true;
  try {
    if(data.estado==='playing')await transact(roomRef(pin),d=>action(d,'tick',now()));
    else if(data.estado==='revealed'&&data.autoAdvance&&!data.showRanking&&now()-(data.revealedAt||now())>=4000&&(data.ronda_actual||0)<(data.rondas||[]).length-1){
      const expected=data.pregunta_actual.id,index=(data.ronda_actual||0)+1;
      const result=await change(d=>d.estado==='revealed'&&d.pregunta_actual.id===expected?action(d,'prepare',now(),{index}):undefined);
      data=result.snapshot.val(); await launch();
    }
  }catch(e){say('No se pudo sincronizar la ronda. Revisa la conexión.');console.error(e);}finally{tickBusy=false;}
},250);
const saved=sessionStorage.getItem('cbAdminRoom');if(saved)connect(saved);

