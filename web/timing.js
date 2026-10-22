const SPEED_KEY = 'changoo.speed.v1';
const valid = value => value && [1,2,3].includes(value.factor) && Number.isInteger(value.delay) && value.delay >= 0 && value.delay <= 209;

export function decodeSpeed(bytes) {
  if (bytes.byteLength !== 8) throw new Error('속도 기록은 8바이트여야 합니다.');
  const view = new DataView(bytes.buffer,bytes.byteOffset,8);
  const speed = {factor:view.getInt32(0,true),delay:view.getInt32(4,true)};
  if (!valid(speed)) throw new Error('속도 기록에 잘못된 값이 있습니다.');
  return speed;
}
export function loadSpeed(storage, fallback) {
  if (!valid(fallback)) throw new Error('잘못된 기본 속도입니다.');
  try { const saved=JSON.parse(storage?.getItem(SPEED_KEY) ?? 'null'); if (valid(saved)) return {factor:saved.factor,delay:saved.delay}; } catch { /* Keep the measured default. */ }
  return {...fallback};
}
export function saveSpeed(storage, speed) {
  if (!valid(speed)) throw new Error('잘못된 속도는 저장할 수 없습니다.');
  try { if (!storage) return false;storage.setItem(SPEED_KEY,JSON.stringify({factor:speed.factor,delay:speed.delay}));return true; } catch { return false; }
}
export function createFrameClock() { return {draw:true,counter:0,lastWait:0}; }
export function cameraWaitReady(clock, now, delay) {
  if (!clock.draw) return true;
  if (now-clock.lastWait < delay) return false;
  clock.lastWait=now;
  return true;
}
// 0x433890 sets the NEXT update's draw flag after running the scheduler.
export function finishFrameTick(clock, factor, boost = 0) {
  const divisor=factor===1 ? 1 : factor-boost;
  const updateDraw=clock.draw;
  clock.draw=clock.counter===0;
  if (++clock.counter>=divisor) clock.counter=0;
  return {updateDraw,present:clock.draw,counter:clock.counter,divisor};
}
