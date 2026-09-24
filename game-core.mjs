export const openRoom = room => !!room && room.estado !== 'closed';
export const elapsed = (q, now) => !q?.startTime ? 0 : Math.max(0, (q.pausedAt || now) - q.startTime - (q.pausedMs || 0));
export const remaining = (q, now) => Math.max(0, (q?.totalTimeSecs || 0) * 1000 - elapsed(q, now));
export function scoreAnswer(q, answer) {
  if (!q?.startTime || !answer || answer.opcion !== q.correcta) return 0;
  const time = answer.elapsedMs ?? (answer.at - q.startTime);
  if (!Number.isFinite(time) || time < 0 || time > q.totalTimeSecs * 1000) return 0;
  return Math.max(100, Math.min(1000, Math.floor(1000 * (1 - time / (q.totalTimeSecs * 1000)))));
}
export function settle(room, now) {
  const q = room.pregunta_actual;
  if (!q?.startTime || room.completed?.[q.id]) return room;
  for (const p of Object.values(room.jugadores || {})) {
    p.puntajesRonda ||= {};
    if (p.puntajesRonda[q.id] != null) continue;
    const pts = scoreAnswer(q, p.respuestas?.[q.id]);
    p.puntajesRonda[q.id] = pts;
    p.puntaje = (p.puntaje || 0) + pts;
  }
  room.completed ||= {};
  room.completed[q.id] = now;
  return room;
}
export function action(room, type, now, payload = {}) {
  if (!openRoom(room)) return;
  if (type === 'close') return { estado: 'closed', closedAt: now };
  if (room.estado === 'final') return;
  const q = room.pregunta_actual;
  if (type === 'ranking') { room.showRanking = !room.showRanking; return room; }
  if (type === 'prepare') {
    if (['playing', 'paused'].includes(room.estado)) return;
    const round = room.rondas?.[payload.index];
    if (!round || room.completed?.[round.id]) return;
    room.ronda_actual = payload.index;
    room.pregunta_actual = { ...round, revealedBlocks: [] };
    room.estado = 'idle'; room.showRanking = false;
  } else if (type === 'launch') {
    if (room.estado !== 'idle' || !q?.image || room.completed?.[q.id]) return;
    q.startTime = now; q.pausedMs = 0; q.revealedBlocks = [];
    q.tileOrder = payload.order;
    room.estado = 'playing'; room.showRanking = false;
  } else if (type === 'pause') {
    if (room.estado === 'playing') { q.pausedAt = now; room.estado = 'paused'; }
    else if (room.estado === 'paused') { q.pausedMs = (q.pausedMs || 0) + now - q.pausedAt; delete q.pausedAt; room.estado = 'playing'; }
    else return;
  } else if (type === 'tick' || type === 'hint') {
    if (room.estado !== 'playing') return;
    if (remaining(q, now) === 0) return action(room, 'reveal', now);
    const count = q.gridSize * q.gridSize;
    const old = q.revealedBlocks || [];
    const target = Math.min(count, type === 'hint' ? old.length + 1 : Math.floor(elapsed(q, now) / (q.totalTimeSecs * 1000) * count));
    if (target <= old.length) return;
    const order = q.tileOrder || Array.from({ length: count }, (_, i) => i);
    q.revealedBlocks = [...old, ...order.filter(i => !old.includes(i)).slice(0, target - old.length)];
  } else if (type === 'reveal') {
    if (!['playing', 'paused'].includes(room.estado)) return;
    settle(room, now); room.estado = 'revealed'; room.revealedAt = now;
  } else if (type === 'end') {
    settle(room, now); room.estado = 'final'; room.showRanking = false; room.finalizado = now;
  } else return;
  return room;
}
export function answerRoom(room, id, roundId, option, now) {
  if (!openRoom(room) || room.estado !== 'playing') return;
  const q = room.pregunta_actual, p = room.jugadores?.[id];
  if (!p || q?.id !== roundId || remaining(q, now) === 0 || !Number.isInteger(option) || option < 0 || option > 3) return;
  p.respuestas ||= {};
  if ((p.respuestas[q.id]?.at || 0) > now) return room;
  if (p.respuestas[q.id]?.opcion === option) return room;
  p.respuestas[q.id] = { opcion: option, at: now, elapsedMs: elapsed(q, now) };
  return room;
}
export const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

