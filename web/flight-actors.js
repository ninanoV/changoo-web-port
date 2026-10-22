import { FLIGHT_ACTORS, FLIGHT_BULLETS } from './flight-actor-data.js';

export const isFlightActor = (kind) => Object.hasOwn(FLIGHT_ACTORS, kind);
export const isFlightEnemy = (kind) => isFlightActor(kind) && kind !== 58;

export function createFlightActor(kind, x, y) {
  const metadata = FLIGHT_ACTORS[kind];
  const [left, top, right, bottom] = metadata.body ?? [];
  return { ...metadata.initial, kind, x, y, oldX: x, oldY: y,
    body: metadata.body ? { left, top, right, bottom } : null, collected: false };
}

export function setFlightActorState(actor, state) {
  if (state === 3) actor.previousState = actor.state;
  const animation = FLIGHT_ACTORS[actor.kind].animations[state];
  Object.assign(actor, { state, frame: 0, ticks: 0, frameCount: animation.frames.length,
    period: animation.period, spriteIndex: animation.frames[0] });
}

export function flightActorSprite(actor) {
  return FLIGHT_ACTORS[actor.kind].images[actor.spriteIndex ?? 0];
}

function pattern(actor) {
  switch (actor.kind) {
    case 60: actor.vx = -2; if (actor.age < 100) actor.vy = 2; break;
    case 61: actor.vx = -2; if (actor.age < 100) actor.vy = -2; break;
    case 62: actor.vx = -2; actor.vy = Math.trunc(actor.timer / 100) % 2 ? 2 : -2; break;
    case 63:
      if (actor.age < 50) { actor.vx = -2; actor.vy = 2; }
      else if (actor.age < 500) { actor.vx = 2; actor.vy = 2; }
      break;
    case 64: actor.vx = actor.age < 20 ? -2 : -8; actor.vy = 0; break;
    default: actor.vx = -2;
  }
  actor.facing = 0;
}

export function stepFlightActor(actor, player, camera) {
  const shots = [];
  if (camera && Math.abs(actor.x - camera.x - 320) > 960) {
    actor.removed = true;
    if (actor.kind === 58) return shots;
  }
  actor.oldX = actor.x; actor.oldY = actor.y;
  if (actor.kind === 58) { actor.x += --actor.vx; actor.y += actor.vy; return shots; }
  const family = actor.kind !== 56 && actor.kind !== 57, state = actor.state;
  if (state <= 2) {
    if (actor.timer === (family ? 40 : actor.kind === 56 ? 50 : 200)) {
      setFlightActorState(actor, 3); actor.timer = 0;
    }
    if (state !== 0) {
      if (family) pattern(actor);
      else { actor.vx = state === 1 ? -2 : 2; actor.facing = state === 1 ? 0 : 1; }
    }
  } else if (state === 3) {
    if (family) pattern(actor);
    if (actor.frame === 0 && actor.ticks === 1) actor.facing = Number(player.x + 38 >= actor.x + Math.trunc(actor.width / 2));
    const fireFrame = family ? 5 : actor.kind === 56 ? 1 : 0;
    if (actor.frame === fireFrame && actor.ticks === (family ? 1 : 9)) {
      if (family) shots.push({ type: 36, x: actor.x + (actor.facing ? actor.width - 10 : 0), y: actor.y + 30, vx: actor.facing ? 8 : -8, vy: 0 });
      else if (actor.kind === 56) shots.push({ type: 37, x: actor.x, y: actor.y + 30,
        vx: ((player.x - actor.x) / 40) | 0, vy: ((player.y - actor.y - 30) / 40) | 0 });
      if (actor.previousState >= 0 && actor.previousState <= 2) setFlightActorState(actor, actor.previousState);
    }
  } else if (state === 4 && actor.frame === 0) {
    if (actor.ticks === 0) actor.vy = -10;
    if (actor.ticks === 9) { actor.period = 10; actor.vy = 10; actor.removed = true; }
  }
  actor.vx -= Math.sign(actor.vx);
  actor.x += actor.vx; actor.y += actor.vy;
  if (++actor.ticks > actor.period) { actor.ticks = 0; actor.frame = (actor.frame + 1) % actor.frameCount; }
  actor.spriteIndex = FLIGHT_ACTORS[actor.kind].animations[actor.state].frames[actor.frame];
  actor.timer++;
  if (family) actor.age++;
  return shots;
}

export function createFlightBullet(shot) {
  const metadata = FLIGHT_BULLETS[shot.type], [left, top, right, bottom] = metadata.body;
  return { ...shot, width: metadata.width, height: metadata.height, body: { left, top, right, bottom },
    oldX: shot.x, oldY: shot.y, removed: false, bounces: 0, exploded: false };
}

export function stepFlightBullet(shot, camera) {
  if (camera && (shot.type === 36 ? Math.abs(shot.x - camera.x - 320) > 960
    : shot.x < camera.x || shot.x > camera.x + 640 || shot.y < camera.y || shot.y > camera.y + 480)) {
    shot.removed = true; return;
  }
  shot.oldX = shot.x; shot.oldY = shot.y;
  shot.x += shot.vx; shot.y += shot.vy;
}
