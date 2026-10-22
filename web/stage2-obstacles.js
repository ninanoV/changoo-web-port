import { STAGE2_OBSTACLES } from './stage2-obstacle-data.js';
import { JUNGLE_BOSS_BULLET } from './jungle-boss-data.js';
import { FINAL_BOSS_SHOTS } from './final-boss-data.js';

export function createObstacle(kind, x, y) {
  const data = STAGE2_OBSTACLES[kind], [left, top, right, bottom] = data.body;
  return { ...data.initial, kind, x, y, oldX: x, oldY: y, body: { left, top, right, bottom }, collected: false };
}

export function stepDropper(actor) {
  const shots = [];
  if (actor.frame === 5 && actor.ticks === 9) shots.push({ type: 98, x: actor.x, y: actor.y, vx: 0, vy: 6 });
  if (++actor.ticks > actor.period) { actor.ticks = 0; actor.frame = (actor.frame + 1) % actor.count; }
  return shots;
}

export function obstacleSprite(actor) {
  return (actor.type === 99 ? FINAL_BOSS_SHOTS[99] : actor.type === 68 ? JUNGLE_BOSS_BULLET : STAGE2_OBSTACLES[actor.kind ?? actor.type]).images[actor.frame];
}

export function createHeavyProjectile(shot) {
  if ([68, 99].includes(shot.type)) {
    const data = shot.type === 68 ? JUNGLE_BOSS_BULLET : FINAL_BOSS_SHOTS[99];
    const [left, top, right, bottom] = data.body;
    return { ...data.initial, ...shot, oldX: shot.x, oldY: shot.y, facing: Number(shot.vx >= 0), body: {left, top, right, bottom}, exploded: false };
  }
  const actor = createObstacle(shot.type, shot.x, shot.y);
  delete actor.kind;
  return { ...actor, ...shot, exploded: false };
}

export function stepHeavyProjectile(shot, camera) {
  if ([68, 99].includes(shot.type)) {
    if (Math.abs(shot.x - camera.x - 320) > 960 || shot.y > camera.y + 400) { shot.removed = true; return; }
    shot.oldX = shot.x; shot.oldY = shot.y;
    shot.x += shot.vx; shot.y += shot.vy;
    if (++shot.ticks > shot.period) { shot.ticks = 0; shot.frame = (shot.frame + 1) % shot.count; }
    return;
  }
  if (Math.abs(shot.x - camera.x - 320) > 960) {
    shot.removed = true;
    if (shot.type === 98) return;
  }
  if (shot.type === 98 && shot.y > camera.y + 380) { shot.removed = true; return; }
  shot.oldX = shot.x; shot.oldY = shot.y;
  if (shot.type === 93) { shot.vx = -4; shot.facing = 0; }
  shot.vx -= Math.sign(shot.vx);
  if (shot.vy <= 10) shot.vy++;
  shot.x += shot.vx; shot.y += shot.vy;
  if (++shot.ticks > shot.period) { shot.ticks = 0; shot.frame = (shot.frame + 1) % shot.count; }
  if (shot.type === 93) shot.spriteIndex = shot.frame;
}
