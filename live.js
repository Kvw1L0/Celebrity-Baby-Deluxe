import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getDatabase, ref, get, set, onValue, runTransaction } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js';
export { ref, get, set, onValue, runTransaction };
export const db = getDatabase(initializeApp({apiKey:'AIzaSyBUDLHNHmourA_rDwa01-GUkqE06mE6hfs',authDomain:'celebrity-baby-35179.firebaseapp.com',databaseURL:'https://celebrity-baby-35179-default-rtdb.firebaseio.com',projectId:'celebrity-baby-35179'}));
let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
export const now = () => Date.now() + offset;
export const roomRef = pin => ref(db, `activacion_arcade/salas/${pin}`);
export const activeRef = ref(db, 'activacion_arcade/sala_activa');
export const $ = id => document.getElementById(id);
export function background(config = {}) {
  const bg = $('bg');
  if (bg) { bg.style.backgroundImage = config.backgroundImage ? `url(${config.backgroundImage})` : 'none'; bg.style.backgroundColor = config.backgroundColor || '#999999'; }
  document.documentElement.style.setProperty('--tile', config.tileColor || '#7c4dff');
  document.documentElement.style.setProperty('--answer-bg', config.answerBg || '#ffd41f');
  document.documentElement.style.setProperty('--answer-text', config.answerText || '#1d1600');
}
export async function transact(target, change) {
  // Warm the cache: an uncached transaction may initially receive null.
  await get(target);
  return runTransaction(target, change, { applyLocally: false });
}

