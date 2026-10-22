import { STAGE2_BOSS } from './stage2-boss-data.js';
import { resolveEnemyTerrain } from './stage2-actors.js';

export function createStage2Boss(x, y) {
  const [left, top, right, bottom] = STAGE2_BOSS.body;
  return { ...STAGE2_BOSS.initial, kind: 32, x, y, oldX: x, oldY: y,
    body: { left, top, right, bottom }, collected: false, deathScene: false, scripted: false };
}

export function setStage2BossState(boss, state) {
  if (state === 6) boss.previousState = boss.state;
  const animation = state >= 8 ? boss.talk.states[state] : STAGE2_BOSS.states[state];
  boss.state = state;
  boss.frame = boss.ticks = 0;
  boss.count = animation.frames.length;
  boss.period = animation.period;
  boss.spriteIndex = animation.frames[0];
}

export function stepStage2Boss(boss, player, sample, deferTerrain = false) {
  const shots = [], state = boss.state;
  if (boss.removed) return shots;
  if (boss.scripted) {
    if (state === 8 || state === 9) boss.vx = 0;
    boss.vx -= Math.sign(boss.vx);
    if (boss.vy <= 10) boss.vy++;
    boss.x += boss.vx; boss.y += boss.vy;
    if (++boss.ticks > boss.period) { boss.ticks = 0; boss.frame = (boss.frame + 1) % boss.count; }
    boss.spriteIndex = (state >= 8 ? boss.talk.states[state] : STAGE2_BOSS.states[state]).frames[boss.frame];
    if (!deferTerrain) resolveEnemyTerrain(boss, sample);
    return shots;
  }
  boss.oldX = boss.x; boss.oldY = boss.y;
  if (state <= 2) {
    if (boss.timer > 200) { setStage2BossState(boss, 6); boss.timer = 0; }
    if (state === 1 || state === 2) { boss.vx = state === 1 ? -2 : 2; boss.facing = state - 1; }
  } else if (state === 6) {
    if (boss.frame === 0 && boss.ticks === 1) boss.facing = Number(player.x + Math.trunc(player.width / 2) >= boss.x + Math.trunc(boss.width / 2));
    if (boss.frame === 2 && boss.ticks === 9) {
      let vx = Math.trunc((player.x - boss.x) / 32) || 0;
      if (vx > 8) vx = 7;
      if (vx < -8) vx = -7;
      shots.push({ type: 91, variant: 'boss2', x: boss.x + (boss.facing ? boss.width - 10 : 0), y: boss.y + 30, vx, vy: -16 });
      setStage2BossState(boss, [0, 1, 2].includes(boss.previousState) ? boss.previousState : player.x < boss.x ? 1 : 2);
    }
  } else if (state === 7) {
    if (boss.frame === 0 && boss.ticks === 0) boss.vy = -10;
    if (boss.frame === 1 && boss.ticks === 0) {
      if (--boss.health < 1) {
        boss.period = 10; boss.vy = 10;
        boss.removed = boss.deathScene = true;
      } else setStage2BossState(boss, 6);
    }
  }
  boss.vx -= Math.sign(boss.vx);
  if (boss.vy <= 10) boss.vy++;
  boss.x += boss.vx; boss.y += boss.vy;
  if (++boss.ticks > boss.period) { boss.ticks = 0; boss.frame = (boss.frame + 1) % boss.count; }
  boss.spriteIndex = STAGE2_BOSS.states[boss.state].frames[boss.frame];
  boss.timer++;
  if (!deferTerrain) resolveEnemyTerrain(boss, sample);
  return shots;
}

export const stage2BossSprite = (boss) => (boss.scripted ? boss.talk.images : STAGE2_BOSS.images)[boss.spriteIndex];
