import { FLIGHT_BOSS } from './flight-boss-data.js';
import { nextRandom } from './random.js';

export function createFlightBoss(x, y) {
  const [left, top, right, bottom] = FLIGHT_BOSS.body;
  return { ...FLIGHT_BOSS.initial, kind: 33, x, y, oldX: x, oldY: y, randomSeed: 1,
    body: { left, top, right, bottom }, collected: false, requeue: null, levelComplete: false };
}

export function setFlightBossState(boss, state) {
  if (state === 3) boss.previousState = boss.state;
  const animation = FLIGHT_BOSS.states[state];
  Object.assign(boss, { state, frame: 0, ticks: 0, count: animation.frames.length,
    period: animation.period, spriteIndex: animation.frames[0] });
}

export function stepFlightBoss(boss, player, camera, random = boss) {
  const shots = [];
  if (Math.abs(boss.x - camera.x - 320) > 2240 || Math.abs(boss.y - camera.y - 240) > 1680) {
    boss.removed = true; boss.requeue = { x: boss.x, y: boss.y };
  }
  boss.oldX = boss.x; boss.oldY = boss.y;
  if (boss.x < camera.x) boss.vx = 10;
  if (boss.x > camera.x + 500) boss.vx = -10;
  if (boss.y < 0) { boss.y = 0; boss.vy = 10; }
  if (boss.y > 480) { boss.y = 480; boss.vy = -10; }
  const state = boss.state;
  const fire = () => shots.push({ type: 37, x: boss.x, y: boss.y + 30,
    vx: ((player.x - boss.x) / 40) | 0, vy: ((player.y - boss.y - 30) / 40) | 0 });
  if (state === 1) {
    if (boss.timer === 20) { setFlightBossState(boss, 3); boss.timer = 0; }
    boss.vx = nextRandom(random) % 7 - 3;
    boss.vy = nextRandom(random) % 7 - 3;
    if (boss.x < camera.x) boss.vx = 10;
    if (boss.x > camera.x + 500) boss.vx = -10;
    if (boss.y < 0) boss.vy = 10;
    if (boss.y > 500) boss.vy = -10;
    boss.facing = 0;
    if (boss.timer > 20) { setFlightBossState(boss, 3); boss.timer = 0; }
  } else if (state === 3) {
    if (boss.frame === 0 && boss.ticks === 1) boss.facing = Number(player.x + 38 >= boss.x + Math.trunc(boss.width / 2));
    if (boss.frame === 1 && boss.ticks === 9) { fire(); setFlightBossState(boss, 1); }
  } else if (state === 4) {
    if (boss.frame === 0) fire();
    if (boss.frame === 1 && boss.ticks === 0) {
      if (--boss.health < 1) {
        boss.period = 10; boss.removed = boss.levelComplete = true;
        return shots;
      }
      setFlightBossState(boss, 3);
    }
  }
  boss.vx -= Math.sign(boss.vx);
  boss.x += boss.vx; boss.y += boss.vy;
  if (++boss.ticks > boss.period) { boss.ticks = 0; boss.frame = (boss.frame + 1) % boss.count; }
  boss.spriteIndex = FLIGHT_BOSS.states[boss.state].frames[boss.frame];
  boss.timer++;
  return shots;
}

export const flightBossSprite = (boss) => FLIGHT_BOSS.images[boss.spriteIndex];
