const KEY = 'changoo.minigame-unlocks.v1';
const STAGE_KEY = 'changoo.stage-unlock.v1';
export const FRESH_MINIGAME_UNLOCKS = Object.freeze([0, 0, 0, 0, 0]);
export const FRESH_STAGE_COUNT = 1;
const validStage = value => Number.isInteger(value) && value >= 1 && value <= 7;
const valid = (flags) => Array.isArray(flags) && flags.length === 5 && flags.every((value) => value === 0 || value === 1);

export function decodeUnlocks(bytes) {
  if (bytes.byteLength !== 20) throw new Error('미니게임 기록은 20바이트여야 합니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = Array.from({ length: 5 }, (_, i) => view.getUint32(i * 4, true));
  if (!valid(flags)) throw new Error('미니게임 기록에 잘못된 값이 있습니다.');
  return flags;
}

export function loadUnlocks(storage, seed) {
  if (!valid(seed)) throw new Error('잘못된 초기 미니게임 기록입니다.');
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? 'null');
    if (valid(saved)) return saved;
  } catch { /* Unavailable or damaged browser storage falls back to the original flags. */ }
  return [...seed];
}

export function saveUnlocks(storage, flags) {
  if (!valid(flags)) throw new Error('잘못된 미니게임 기록은 저장할 수 없습니다.');
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(flags));
    return true;
  } catch { return false; }
}

export function decodeStageProgress(bytes) {
  if (bytes.byteLength !== 4) throw new Error('스테이지 기록은 4바이트여야 합니다.');
  const count = new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0, true);
  if (count < 1) throw new Error('스테이지 기록에 잘못된 값이 있습니다.');
  return Math.min(7, count);
}

export function loadStageProgress(storage, seed) {
  if (!validStage(seed)) throw new Error('잘못된 초기 스테이지 기록입니다.');
  try {
    const saved = JSON.parse(storage?.getItem(STAGE_KEY) ?? 'null');
    if (validStage(saved)) return saved;
  } catch { /* Use the original stage record when browser storage is unavailable. */ }
  return seed;
}

// 0x43ee50 saves the highest entered stage, not a position, inventory or clear flag.
export function enterSavedStage(storage, unlocked, stage) {
  if (!validStage(unlocked) || !validStage(stage)) throw new Error('잘못된 스테이지는 저장할 수 없습니다.');
  const count = Math.max(unlocked, stage);
  if (count === unlocked) return { count, written: false, saved: true };
  try {
    if (!storage) return { count, written: false, saved: false };
    storage.setItem(STAGE_KEY, JSON.stringify(count));
    return { count, written: true, saved: true };
  } catch { return { count, written: false, saved: false }; }
}
