import { $, ref, onValue, get, set, transact, roomRef, now, background } from './live.js';
import { openRoom, answerRoom, remaining, escapeHTML } from './game-core.mjs';
let room=sessionStorage.getItem('cbRoom'),id=sessionStorage.getItem('cbId'),data,unsubscribe,key='',notified='',pending=0;
const query=new URLSearchParams(location.search),requested=query.get('room');
$('pin').value=requested||'';
function reset(message='La sala se cerró. Escanea el nuevo QR para volver a jugar.') {
  unsubscribe?.();unsubscribe=null;room=null;id=null;data=null;key='';notified='';pending++;
  sessionStorage.removeItem('cbRoom');sessionStorage.removeItem('cbId');
  history.replaceState(null,'',location.pathname);
  $('login').classList.remove('hidden');$('play').classList.add('hidden');$('score').classList.add('hidden');
  $('pin').value='';$('name').value='';$('image').removeAttribute('src');$('grid').replaceChildren();$('options').replaceChildren();
  $('loginMessage').textContent=message;background();
}
$('join').onclick=async()=>{
  const code=$('pin').value.trim(),name=$('name').value.trim().toUpperCase();
  if(!/^\d{4}$/.test(code)||name.length<2){$('loginMessage').textContent='Completa el PIN de cuatro dígitos y tu apodo.';return;}
  $('join').disabled=true;
  try{
    const roomSnapshot=await get(roomRef(code)),roomData=roomSnapshot.val();
    if(!openRoom(roomData)||roomData.estado==='final'){$('loginMessage').textContent='Esa sala no existe, está cerrada o ya terminó.';return;}
    const playerId='p_'+crypto.randomUUID();
    // Register below the room rather than replacing it. This works with the
    // Firebase rules that permit participant writes but reject room transactions.
    await set(ref(roomRef(code),`jugadores/${playerId}`),{nombre:name,puntaje:0});
    room=code;id=playerId;sessionStorage.setItem('cbRoom',room);sessionStorage.setItem('cbId',id);connect();
  }catch(e){$('loginMessage').textContent='No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.';console.error(e);}
  finally{$('join').disabled=false;}
};
function connect(){
  unsubscribe?.();$('login').classList.add('hidden');$('play').classList.remove('hidden');$('score').classList.remove('hidden');
  unsubscribe=onValue(roomRef(room),s=>{data=s.val();if(!openRoom(data)||!data.jugadores?.[id])return reset();render();},()=>reset('No se pudo acceder a la sala. Intenta ingresar nuevamente.'));
}
function render(){
  const q=data.pregunta_actual||{},p=data.jugadores[id],phase=data.estado;
  background(data.config);$('score').textContent=(p.puntaje||0)+' pts';
  $('state').textContent=({lobby:'Sala abierta',idle:'Siguiente ronda',playing:'En juego',paused:'En pausa',revealed:'Respuesta',final:'Final'})[phase]||'Esperando';
  const fresh=(q.id||'')+':'+(q.startTime||0);
  if(key!==fresh){key=fresh;notified='';$('result').classList.remove('incorrect');build(q);}
  const visible=!!q.image&&['idle','playing','paused','revealed'].includes(phase);
  $('waiting').classList.toggle('hidden',visible||phase==='final');$('round').classList.toggle('hidden',!visible);
  $('result').classList.toggle('hidden',!['revealed','final'].includes(phase));
  $('options').classList.toggle('hidden',!['playing','paused'].includes(phase));
  document.querySelectorAll('.option').forEach(b=>{const selected=+b.dataset.option===p.respuestas?.[q.id]?.opcion;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('.tile').forEach((tile,i)=>tile.classList.toggle('reveal',phase==='revealed'||(q.revealedBlocks||[]).includes(i)));
  if(phase==='revealed'){
    const correct=p.respuestas?.[q.id]?.opcion===q.correcta;
    $('correctAnswer').textContent=q.opciones?.[q.correcta]||'';
    $('title').textContent=correct?'¡Correcto!':'Incorrecto';
    $('message').textContent=correct?'+'+(p.puntajesRonda?.[q.id]||0)+' puntos':p.respuestas?.[q.id]?'La respuesta correcta está arriba.':'No alcanzaste a responder.';
    $('result').classList.toggle('incorrect',!correct);
    if(!correct&&notified!==key){navigator.vibrate?.([90,45,120,45,220]);notified=key;}
  }else if(phase==='final'){$('result').classList.remove('incorrect');$('title').textContent='¡Juego terminado!';$('correctAnswer').textContent=(p.puntaje||0)+' puntos';$('message').textContent='Mira el podio en la pantalla gigante.';}
  updateClock();
}
function build(q){
  $('options').replaceChildren();$('grid').replaceChildren();if(!q.image)return;
  $('image').src=q.image;const n=q.gridSize||6;$('grid').style.gridTemplateColumns=`repeat(${n},1fr)`;
  $('grid').innerHTML=Array.from({length:n*n},()=>'<i class="tile"></i>').join('');
  $('options').innerHTML=(q.opciones||[]).map((text,i)=>`<button class="option" data-option="${i}" aria-pressed="false">${escapeHTML(text)}</button>`).join('');
  document.querySelectorAll('.option').forEach(b=>b.onclick=()=>choose(q.id,+b.dataset.option));
}
async function choose(roundId,option){
  if(!data||data.estado!=='playing'||remaining(data.pregunta_actual,now())<=0)return;
  const attempt=++pending,code=room,player=id;
  document.querySelectorAll('.option').forEach(b=>{const selected=+b.dataset.option===option;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  const at=now();$('answerStatus').textContent='Guardando…';
  try{const result=await transact(roomRef(code),d=>answerRoom(d,player,roundId,option,at));if(attempt===pending)$('answerStatus').textContent=result.committed?'Respuesta guardada. Puedes cambiarla mientras corre el tiempo.':'La ronda ya no admite respuestas.';}
  catch(e){if(attempt===pending)$('answerStatus').textContent='No se guardó. Revisa tu conexión y vuelve a tocar la alternativa.';console.error(e);}
  finally{if(data&&attempt===pending)render();}
}
function updateClock(){
  if(!data)return;const q=data.pregunta_actual||{},state=data.estado;
  $('timer').textContent=state==='idle'?'Ronda lista':state==='paused'?'Pausa':state==='revealed'?'':Math.ceil(remaining(q,now())/1000)+' segundos';
  document.querySelectorAll('.option').forEach(b=>b.disabled=state!=='playing'||remaining(q,now())===0);
}
setInterval(updateClock,250);
if(room&&id&&(!requested||requested===room))connect();
else if(requested&&requested!==room){sessionStorage.removeItem('cbRoom');sessionStorage.removeItem('cbId');room=null;id=null;}

