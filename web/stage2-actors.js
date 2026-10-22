import { bodyCollision, resolveTerrain } from './game.js';
import { STAGE2_ACTORS } from './stage2-actor-data.js';

export const isStage2Enemy = (kind) => Object.hasOwn(STAGE2_ACTORS, kind);
export const isJungleBoss = (kind) => kind === 39 || kind === 40;
export const isFinalBoss = (kind) => kind === 41 || kind === 59;
const isBoss = (kind) => isJungleBoss(kind) || isFinalBoss(kind);
export const stage2Defeated = (actor) => actor.state === STAGE2_ACTORS[actor.kind].deathState;

export function createStage2Enemy(kind, x, y) {
  const data = STAGE2_ACTORS[kind], [left, top, right, bottom] = data.body;
  return { ...data.initial, kind, x, y, oldX: x, oldY: y, body: { left, top, right, bottom }, collected: false, requeue: null };
}

export function setStage2State(actor, state) {
  const animation = (actor.scripted && actor.talk.states[state]) || STAGE2_ACTORS[actor.kind].states[state];
  if ((([34, 36, 41].includes(actor.kind) || isJungleBoss(actor.kind)) && state === 3) || (actor.kind === 41 && state === 5)) actor.previousState = actor.state;
  if (actor.kind === 40 && state === 3) actor.vy = -20;
  actor.state = state;
  actor.frame = actor.ticks = 0;
  actor.count = animation.frames.length;
  actor.period = animation.period;
  actor.spriteIndex = animation.frames[0];
}

export function stage2Sprite(actor) {
  return (actor.scripted ? actor.talk.images : STAGE2_ACTORS[actor.kind].images)[actor.spriteIndex];
}

export function resolveEnemyTerrain(actor, sample) {
  const hit = bodyCollision(actor.x, actor.y, sample, actor.body);
  if (hit === 1) resolveTerrain(actor, actor.oldX, actor.oldY, sample, actor.body);
  if (hit !== 2) return;
  for (let rise = 0; rise < 26; rise++) {
    if (!bodyCollision(actor.x, actor.y - rise, sample, actor.body)) { actor.y -= rise; actor.vy += 2; return; }
  }
  for (let y = actor.y; y >= actor.oldY; y--) {
    if (!bodyCollision(actor.x, y, sample, actor.body)) { actor.y = y; break; }
  }
}

export function stepStage2Enemy(actor, player, sample, deferTerrain, camera) {
  const shots = [], state = actor.state;
  actor.sounds = [];
  if (actor.scripted) {
    if (actor.talk.states[state]) actor.vx = actor.talk.states[state].vx ?? 0;
    actor.vx -= Math.sign(actor.vx);
    if (actor.vy <= 10) actor.vy++;
    actor.x += actor.vx; actor.y += actor.vy;
    if (++actor.ticks > actor.period) { actor.ticks = 0; actor.frame = (actor.frame + 1) % actor.count; }
    actor.spriteIndex = (actor.talk.states[state] ?? STAGE2_ACTORS[actor.kind].states[state]).frames[actor.frame];
    if (!deferTerrain) resolveEnemyTerrain(actor, sample);
    return shots;
  }
  if (camera && [20, 21, 22, 23, 48, 51, 93, 119].includes(actor.kind) && (Math.abs(actor.x - camera.x - 320) > (actor.kind === 20 ? 2240 : 960)
    || (actor.kind === 20 && Math.abs(actor.y - camera.y - 240) > 1680))) {
    actor.removed = true; actor.requeue = { x: actor.x, y: actor.y };
  }
  actor.oldX = actor.x; actor.oldY = actor.y;
  if (stage2Defeated(actor)) {
    if (actor.frame === 0 && actor.ticks === 0) actor.vy = -10;
    if ((actor.kind === 119 && actor.frame === 0 && actor.ticks === 9) || (actor.kind !== 119 && actor.frame === 1 && actor.ticks === 0)) {
      if (!isBoss(actor.kind) || --actor.health < 1) { actor.period = 10; actor.vy = 10; actor.removed = true; }
      if (isBoss(actor.kind)) setStage2State(actor, player.x < actor.x ? 1 : 2);
    }
    if (![22, 31, 39, 40, 93].includes(actor.kind) && actor.frame === 1 && actor.ticks === 9) actor.removed = true;
  } else if ([0, 1, 2].includes(state)) {
    if ([34, 36].includes(actor.kind) && actor.timer === 200) { setStage2State(actor, 3); actor.timer = 0; }
    if (isJungleBoss(actor.kind) && actor.timer > 200) { setStage2State(actor, 3); actor.timer = 0; }
    if (isFinalBoss(actor.kind) && actor.timer > 200) {
      // 0x44306a compares boss59 with its own global pointer, so its natural choice is always state4.
      setStage2State(actor, actor.kind === 59 ? 4 : actor.y + Math.trunc(actor.height / 2) > player.y ? 3 : 5);
      actor.timer = 0;
    }
    if ([22, 93].includes(actor.kind) && actor.timer > 100) {
      setStage2State(actor, 3); actor.timer = 0;
      actor.sounds.push(...STAGE2_ACTORS[actor.kind].attackSound);
    }
    if ([31, 48].includes(actor.kind) && (state === 1 || state === 2)) {
      const counter = state === 1 ? 'leftTicks' : 'rightTicks';
      if (++actor[counter] > (actor.kind === 48 ? 50 : 20)) { actor[counter] = 0; setStage2State(actor, state + 3); }
    }
    if (actor.kind === 48 && state !== 0 && actor.timer > 100) {
      setStage2State(actor, 6); actor.timer = 0; actor.sounds.push(...STAGE2_ACTORS[48].attackSound);
    }
    if (state === 1 || state === 2) {
      actor.facing = state - 1;
      actor.vx = (state === 1 ? -1 : 1) * ([22, 23, 31, 40, 93].includes(actor.kind) ? 4 : 2);
    }
  } else if ([22, 93].includes(actor.kind) && state === 3) {
    if (actor.kind === 93) actor.facing = Number(player.x >= actor.x);
    if (actor.frame === 2 && actor.ticks === 0) {
      shots.push({ type: 97, x: actor.x + 16, y: actor.y + 40, vx: actor.kind === 22 ? 0 : actor.facing ? 10 : -10, vy: actor.kind === 22 ? 6 : -16 });
      setStage2State(actor, actor.kind === 22 ? 1 : actor.facing + 1);
    }
  } else if ([31, 48].includes(actor.kind) && (state === 4 || state === 5)) {
    actor.facing = state - 4;
    actor.vx = (state === 4 ? -1 : 1) * (actor.kind === 48 ? 4 : 6);
    if (actor.kind === 48 && actor.timer > 100) {
      setStage2State(actor, 6); actor.timer = 0; actor.sounds.push(...STAGE2_ACTORS[48].attackSound);
    }
  } else if (actor.kind === 48 && state === 6) {
    actor.vx = actor.facing ? 4 : -4;
    if (actor.frame === 2 && actor.ticks === 9) setStage2State(actor, player.x < actor.x ? 1 : 2);
  } else if (actor.kind === 40 && state === 3) {
    actor.vx = actor.facing ? 8 : -8;
    if (actor.frame === 1 && actor.ticks === 9) setStage2State(actor, player.x < actor.x ? 1 : 2);
  } else if (actor.kind === 41 && (state === 3 || state === 5)) {
    if (actor.frame === 0 && actor.ticks === 1) actor.facing = Number(player.x + 38 >= actor.x + Math.trunc(actor.width / 2));
    if (actor.frame === (state === 3 ? 1 : 2) && actor.ticks === 9) {
      shots.push({type: state === 3 ? 99 : 67, x: actor.x + (actor.facing ? actor.width - 10 : 0),
        y: actor.y + (state === 3 ? 30 : 50), vx: state === 3 ? actor.facing ? 8 : -8 : 0, vy: 0});
    }
    if (actor.frame === (state === 3 ? 2 : 3) && actor.ticks === 9) setStage2State(actor, player.x < actor.x ? 1 : 2);
  } else if (actor.kind === 59 && (state === 4 || state === 5)) {
    if (actor.frame === 1 && actor.ticks === 9) setStage2State(actor, 2);
  } else if ([34, 36, 39].includes(actor.kind) && state === 3) {
    if (actor.frame === 0 && actor.ticks === 1) actor.facing = Number(player.x + 38 >= actor.x + Math.trunc(actor.width / 2));
    if (actor.frame === (actor.kind === 34 ? 3 : 2) && actor.ticks === 9) {
      let vx = Math.trunc((player.x - actor.x) / 32);
      if (vx > 8) vx = 7;
      if (vx < -8) vx = -7;
      shots.push({ type: actor.kind === 39 ? 68 : actor.kind === 34 ? 94 : 91, x: actor.x + (actor.facing ? actor.width - 10 : 0), y: actor.y + 30,
        vx: actor.kind === 39 ? actor.facing ? 8 : -8 : vx, vy: actor.kind === 39 ? 0 : -16 });
      setStage2State(actor, actor.kind === 39 ? player.x < actor.x ? 1 : 2 : actor.previousState);
    }
  }
  actor.vx -= Math.sign(actor.vx);
  if (![20, 22, 51, 119].includes(actor.kind) && actor.vy <= 10) actor.vy++;
  actor.x += actor.vx; actor.y += actor.vy;
  if (++actor.ticks > actor.period) { actor.ticks = 0; actor.frame = (actor.frame + 1) % actor.count; }
  actor.spriteIndex = STAGE2_ACTORS[actor.kind].states[actor.state].frames[actor.frame];
  if ([22, 34, 36, 39, 40, 41, 48, 59, 93].includes(actor.kind)) actor.timer++;
  if (actor.kind === 30 && ++actor.timer === 100) {
    actor.timer = 0;
    shots.push({ type: 93, x: actor.x + 20, y: actor.y + 30, vx: -10, vy: -10 });
  }
  if (!deferTerrain) resolveEnemyTerrain(actor, sample);
  return shots;
}
