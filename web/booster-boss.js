import { BOOSTER_BOSS, BOOSTER_SHOT } from './booster-boss-data.js';
import { resolveEnemyTerrain } from './stage2-actors.js';

export function createBoosterBoss(x, y) {
  const [left, top, right, bottom] = BOOSTER_BOSS.body;
  return { ...BOOSTER_BOSS.initial, kind: 122, x, y, oldX: x, oldY: y,
    body: {left, top, right, bottom}, collected: false, sounds: [], exitMovie: false };
}

export function setBoosterBossState(boss, state) {
  if (state === 3) boss.previousState = boss.state;
  const animation = BOOSTER_BOSS.states[state];
  Object.assign(boss, {state, frame: 0, ticks: 0, count: animation.frames.length,
    period: animation.period, spriteIndex: animation.frames[0]});
  if (state === 5) boss.health--;
}

export function stepBoosterBoss(boss, player, sample, deferTerrain) {
  const shots = [], state = boss.state;
  boss.sounds = [];
  boss.oldX = boss.x; boss.oldY = boss.y;
  const volley = () => {
    boss.facing = Number(player.x >= boss.x + Math.trunc(boss.width / 2));
    boss.sounds.push(BOOSTER_BOSS.attackSounds[0]);
    for (const delay of [100, 80, 60, 40, 20]) shots.push({type: 70, x: boss.x + (boss.facing ? boss.width - 58 : 58),
      y: boss.y + 86, vx: boss.facing ? 8 : -8, vy: 0, delay});
  };
  if (state === 1 || state === 2) {
    if (boss.timer > 50) { setBoosterBossState(boss, 3); boss.timer = 0; }
    boss.vx = state === 1 ? -2 : 2; boss.facing = state - 1;
  } else if (state === 3) {
    if (boss.frame === 0 && boss.ticks === 0) boss.facing = Number(player.x + 38 >= boss.x + Math.trunc(boss.width / 2));
    if (boss.frame === 1 && boss.ticks === 1) volley();
    if (boss.frame === 3 && boss.ticks === 9) setBoosterBossState(boss, player.x + 38 < boss.x + Math.trunc(boss.width / 2) ? 1 : 2);
  } else if (state === 5) {
    if (boss.frame === 0 && boss.ticks === 0 && boss.health === 0) boss.vy = -10;
    if (boss.frame === 0 && boss.ticks === 9) {
      if (boss.health === 0) {
        boss.period = 10; boss.vy = 10; boss.removed = boss.exitMovie = true;
        return shots;
      }
      setBoosterBossState(boss, 3); volley();
    }
  }
  boss.vx -= Math.sign(boss.vx);
  if (boss.vy <= 10) boss.vy++;
  boss.x += boss.vx; boss.y += boss.vy;
  if (++boss.ticks > boss.period) { boss.ticks = 0; boss.frame = (boss.frame + 1) % boss.count; }
  boss.spriteIndex = BOOSTER_BOSS.states[boss.state].frames[boss.frame];
  boss.timer++;
  if (!deferTerrain) resolveEnemyTerrain(boss, sample);
  return shots;
}

export const boosterBossSprite = (boss) => BOOSTER_BOSS.images[boss.spriteIndex];

export function createBoosterShot(shot) {
  const [left, top, right, bottom] = BOOSTER_SHOT.body;
  return {...shot, width: BOOSTER_SHOT.width, height: BOOSTER_SHOT.height, body: {left, top, right, bottom},
    oldX: shot.x, oldY: shot.y, frame: 0, ticks: 0, count: 3, period: 4, facing: Number(shot.vx >= 0), removed: false};
}

export function stepBoosterShot(shot, player, camera) {
  if (Math.abs(shot.x - camera.x - 320) > 960 || shot.y > camera.y + 480) { shot.removed = true; return; }
  shot.oldX = shot.x; shot.oldY = shot.y;
  shot.x += shot.vx; shot.y += shot.vy;
  if (++shot.ticks > shot.period) { shot.ticks = 0; shot.frame = (shot.frame + 1) % shot.count; }
  if (shot.delay > 0) {
    shot.delay--; shot.vx = 0; shot.vy = player.y + 20 < shot.y ? -4 : 4;
  } else { shot.vx += shot.facing ? 1 : -1; shot.vy = 0; }
}

export const boosterShotSprite = (shot) => BOOSTER_SHOT.images[shot.frame];
