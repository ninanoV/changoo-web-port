import { bodyCollision, resolveTerrain, stepPlayer, overlaps, transformPlayer, isAirState, objectPlacement } from './game.js';
import { createSurface, stepSurface, touchSurface, isSurfaceKind, isWoodSurface } from './surfaces.js';
import { createEvent, advanceEvent, finishEvent, stepEventPlayer, stepEventNpc } from './events.js';
import { createIntro, stepIntro } from './intro.js';
import { createInventory, stepInventory } from './inventory.js';
import { createCompanion, stepCompanion, createDog, activateDog, stepDog, createRabbit, stepRabbit } from './companions.js';
import { createBoss, stepBoss, bossSprite, damageBoss, turnBoss } from './boss.js';
import { createMinigame, stepMinigame } from './minigames.js';
import { createStageEntry, stepStageEntry } from './stage-entry.js';
import { STAGE2_ACTORS, IGNORED_KINDS, JUNGLE_PROJECTILE } from './stage2-actor-data.js';
import { isStage2Enemy, isJungleBoss, isFinalBoss, stage2Defeated, createStage2Enemy, setStage2State, stage2Sprite, stepStage2Enemy, resolveEnemyTerrain } from './stage2-actors.js';
import { createObstacle, stepDropper, createHeavyProjectile, stepHeavyProjectile, obstacleSprite } from './stage2-obstacles.js';
import { createStage2Boss, setStage2BossState, stepStage2Boss, stage2BossSprite } from './stage2-boss.js';
import { STAGE2_BOSS } from './stage2-boss-data.js';
import { stepBooster, hurtBooster } from './booster.js';
import { stepFlight, hurtFlight } from './flight.js';
import { MOLE_PORTAL } from './mole-data.js';
import { isFlightActor, isFlightEnemy, createFlightActor, setFlightActorState, stepFlightActor, flightActorSprite, createFlightBullet, stepFlightBullet } from './flight-actors.js';
import { createFlightBoss, setFlightBossState, stepFlightBoss, flightBossSprite } from './flight-boss.js';
import { entersSpawnWindow } from './spawning.js';
import { SECONDARY_KINDS } from './spawn-data.js';
import { advanceCamera, initialCameraScan } from './camera.js';
import { createBoosterBoss, setBoosterBossState, stepBoosterBoss, boosterBossSprite, createBoosterShot, stepBoosterShot } from './booster-boss.js';
import { BOOSTER_BOSS } from './booster-boss-data.js';
import { FLIGHT_LASER } from './flight-data.js';
import { enterFall, stepFall } from './fall.js';
import { JUNGLE_ITEMS } from './jungle-item-data.js';
import { ROCK } from './rock-data.js';
import { CARD_PORTAL } from './card-data.js';
import { FIRE_EFFECT, FINAL_PROJECTILE } from './final-stage-data.js';
import { PUZZLE_PORTAL } from './puzzle-data.js';
import { FINAL_BOSS_SHOTS } from './final-boss-data.js';
import { createEnding, stepEnding } from './ending.js';
export { overlaps } from './game.js';

const ENEMY_BODY = { left: 28, top: 14, right: 46, bottom: 71 };
const ITEM_BODY = { left: 5, top: 15, right: 26, bottom: 50 };
export const MARKER_BODY = { left: 0, top: 0, right: 15, bottom: 15 };
export const isEnemy = (actor) => isFlightEnemy(actor.kind) || (actor.kind >= 0 && actor.kind <= 2) || [18, 32, 33, 122].includes(actor.kind) || isStage2Enemy(actor.kind);
const COMPANION_KINDS = [24, 25, 26, 27, 28, 38];
const COMPANION_IMAGES = ['item_m.app', 'item_f.app', 'item_si.app', 'item_ym.app', 'item_fr.app', 'item_w.app'];
export const isActorKind = (kind) => isFlightActor(kind) || isStage2Enemy(kind) || [0, 1, 2, 10, 11, 12, 18, 32, 33, 35, 42, 43, 44, 45, 52, 53, 87, 95, 120, 121, 122, 123, 124, 125, 126, ...COMPANION_KINDS].includes(kind);
const defeated = (actor) => actor.kind === 122 ? actor.state === 5 : (actor.kind === 33 || isFlightEnemy(actor.kind)) ? actor.state === 4 : actor.kind === 32 ? actor.state === 7 : isStage2Enemy(actor.kind) ? stage2Defeated(actor) : actor.state === (actor.kind === 0 ? 3 : 4);

export function readStageObjects(map, config, archive) {
  const types = new TextDecoder().decode(config).trim().split(/\s+/).map((name) => name.replace(/\.raw$/i, '.app'));
  const objects = [];
  for (let i = 0; i < map.cells.length; i += 5) {
    const kind = map.cells[i + 2];
    if (kind < 0) continue;
    const name = types[kind], bytes = archive.get(name);
    if (!name || !bytes || bytes.length < 12) throw new Error(`알 수 없는 오브젝트: ${kind}`);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = header.getUint32(0, true), height = header.getUint32(4, true);
    const column = i / 5 % map.width, row = Math.floor(i / 5 / map.width);
    objects.push({ kind, column, row, name, width, height,
      hidden: IGNORED_KINDS.includes(kind) || /^(sp_|ev\d|act\.|fall\.|up\.|down\.)/.test(name),
      ...objectPlacement(column, row, map.cells[i + 3], map.cells[i + 4], width, height) });
  }
  return objects;
}

export function createActor(kind, x, y) {
  if (!isActorKind(kind)) throw new Error(`Unsupported actor: ${kind}`);
  if (kind === 95) return {...FIRE_EFFECT.initial, kind, x, y, oldX: x, oldY: y, body: null};
  if (kind === 121) return {kind, ...createProjectile({type: 60, x, y, vx: -6, vy: -8})};
  if (kind === 122) return createBoosterBoss(x, y);
  if (kind === 33) return createFlightBoss(x, y);
  if (isFlightActor(kind)) return createFlightActor(kind, x, y);
  if (kind === 18) return createBoss(x, y);
  if (kind === 32) return createStage2Boss(x, y);
  if (kind === 35 || kind === 42) return createObstacle(kind, x, y);
  if (isStage2Enemy(kind)) return createStage2Enemy(kind, x, y);
  if ([87, 123, 124, 125, 126].includes(kind)) return { kind, x, y, vx: 0, vy: 0,
    body: { left: 0, top: 0, right: 79, bottom: 91 }, width: kind === 125 ? PUZZLE_PORTAL.width : kind === 126 ? CARD_PORTAL.width : kind === 87 ? MOLE_PORTAL.width : kind === 123 ? 73 : 58,
    height: kind === 125 ? PUZZLE_PORTAL.height : kind === 126 ? CARD_PORTAL.height : kind === 87 ? MOLE_PORTAL.height : kind === 123 ? 102 : 104, collected: false, removed: false };
  const enemy = kind <= 2;
  const small = kind === 43;
  const item = JUNGLE_ITEMS[kind];
  const [left, top, right, bottom] = item?.body ?? [];
  const body = item ? {left, top, right, bottom} : enemy ? ENEMY_BODY : ITEM_BODY;
  return { kind, x, y, vx: 0, vy: 0, state: enemy ? 1 : 0, frame: 0, ticks: 0, period: 10,
    facing: kind === 2 ? 100 : 0, timer: kind === 1 ? 100 : 0, previousState: 0,
    body, width: item?.width ?? (enemy ? 76 : kind === 10 ? 25 : small ? 16 : kind === 44 ? 34 : 32),
    height: item?.height ?? (enemy ? 72 : kind === 10 ? 39 : small ? 16 : kind === 44 ? 36 : 32), collected: false, removed: false };
}

function changeState(actor, state) {
  if (isStage2Enemy(actor.kind)) { setStage2State(actor, state); return; }
  actor.state = state;
  actor.frame = actor.ticks = 0;
  actor.period = state === 0 ? 100 : defeated(actor) && actor.kind !== 0 ? 20 : 10;
}

export function turnActor(actor, direction) {
  if (actor.kind === 122) {
    if (!defeated(actor) && (direction === 1 || direction === 2)) setBoosterBossState(actor, direction);
    return;
  }
  if (actor.kind === 33) return;
  if (isFlightEnemy(actor.kind)) {
    if (!defeated(actor) && direction >= 0 && direction <= 2) setFlightActorState(actor, direction);
    return;
  }
  if (actor.kind === 18) { turnBoss(actor, direction); return; }
  if (actor.kind === 32) {
    if (actor.state !== 7 && direction >= 0 && direction <= 2) setStage2BossState(actor, direction);
    return;
  }
  if (isEnemy(actor) && !defeated(actor) && direction >= 0 && direction <= 2) {
    changeState(actor, direction);
    return STAGE2_ACTORS[actor.kind]?.turnSounds?.[direction] ?? [];
  }
}

export function actorSprite(actor) {
  if (actor.kind === 125) return PUZZLE_PORTAL.name;
  if (actor.kind === 95) return FIRE_EFFECT.images[actor.spriteIndex];
  if (actor.kind === 126) return CARD_PORTAL.name;
  if (actor.kind === 121) return ROCK.name;
  if (JUNGLE_ITEMS[actor.kind]) return JUNGLE_ITEMS[actor.kind].name;
  if (actor.kind === 122) return boosterBossSprite(actor);
  if (actor.kind === 33) return flightBossSprite(actor);
  if (isFlightActor(actor.kind)) return flightActorSprite(actor);
  if (actor.kind === 32) return stage2BossSprite(actor);
  if (actor.kind === 35) return obstacleSprite(actor);
  if (isStage2Enemy(actor.kind)) return stage2Sprite(actor);
  if (actor.kind === 18) return bossSprite(actor);
  if (COMPANION_KINDS.includes(actor.kind)) return COMPANION_IMAGES[COMPANION_KINDS.indexOf(actor.kind)];
  if (actor.scripted) return actor.state === 4 ? '1#331.app' : '1#332.app';
  if (!isEnemy(actor)) return ({ 10: 'chocobi.app', 11: 'ichi.app', 12: 'iroa.app', 42: 'life.app', 43: 'ball.app', 44: 'wbomb.app', 45: 'can.app', 87: MOLE_PORTAL.name, 123: 'gamecar.app', 124: 'gamech_b.app' })[actor.kind];
  const prefix = `c${actor.kind + 1}`;
  if (defeated(actor)) return `${prefix}_${actor.frame ? 'f' : 'd'}.app`;
  if (actor.state === 3) return `${prefix}_a${actor.frame + 1}.app`;
  if (actor.state === 0) return `${prefix}.app`;
  return `${prefix}_w${actor.frame + 1}.app`;
}

export function stepActor(actor, player, sample, deferTerrain = false, camera, random) {
  const shots = [];
  if (actor.removed) return shots;
  if (actor.kind === 95) {
    if (camera && Math.abs(actor.x - camera.x - 320) > 960) { actor.removed = true; actor.requeue = {x: actor.x, y: actor.y}; }
    actor.oldX = actor.x; actor.oldY = actor.y;
    actor.vx -= Math.sign(actor.vx); actor.x += actor.vx; actor.y += actor.vy;
    if (++actor.ticks > actor.period) { actor.ticks = 0; actor.frame = (actor.frame + 1) % actor.count; }
    actor.spriteIndex = FIRE_EFFECT.frames[actor.frame];
    return shots;
  }
  if (actor.kind === 121) { stepProjectile(actor, sample, deferTerrain, camera); return shots; }
  if (actor.kind === 122) return stepBoosterBoss(actor, player, sample, deferTerrain);
  if (actor.kind === 33) return stepFlightBoss(actor, player, camera, random);
  if (isFlightActor(actor.kind)) return stepFlightActor(actor, player, camera);
  if (actor.kind === 32) return stepStage2Boss(actor, player, sample, deferTerrain);
  if (actor.kind === 35) return stepDropper(actor);
  if (isStage2Enemy(actor.kind)) return stepStage2Enemy(actor, player, sample, deferTerrain, camera);
  if (actor.kind === 18) { stepBoss(actor, player, sample, deferTerrain); return shots; }
  if (actor.collected) {
    // 0x414750 / 0x43be80: pickup flies from the original companion HUD position.
    actor.screenY += actor.vy;
    if (actor.vy <= 10) actor.vy++;
    if (actor.screenY > 480) actor.removed = true;
    return shots;
  }
  if (!isEnemy(actor)) return shots;
  const oldX = actor.x, oldY = actor.y;
  actor.oldX = oldX; actor.oldY = oldY;
  const state = actor.state;
  if (actor.scripted) {
    actor.vx = 0;
  } else if (defeated(actor)) {
    if (actor.frame === 0 && actor.ticks === 0) actor.vy = -10;
    if (actor.frame === 1 && actor.ticks === 0) {
      actor.period = 10;
      actor.vy = 10;
      actor.removed = true;
    }
    if (actor.frame === 1 && actor.ticks === 9) actor.removed = true;
  } else if (state === 0 || state === 1 || state === 2) {
    if (actor.kind !== 0 && actor.timer === 200 && (state !== 0 || actor.kind === 1)) {
      actor.previousState = state;
      changeState(actor, 3);
      actor.timer = 0;
    }
    if (state === 1) { actor.vx = -2; actor.facing = 0; }
    if (state === 2) { actor.vx = 2; actor.facing = 1; }
  } else if (state === 3) {
    if (actor.frame === 0 && actor.ticks === 1) actor.facing = Number(player.x + 38 >= actor.x + 38);
    if (actor.frame === 2 && actor.ticks === 9) {
      let vx = ((player.x - actor.x) / 32) | 0;
      if (vx > 8) vx = 7;
      if (vx < -8) vx = -7;
      shots.push({ type: actor.kind === 1 ? 91 : 95,
        x: actor.x + (actor.facing ? 66 : 0), y: actor.y + 30,
        vx: actor.kind === 1 ? vx : actor.facing ? 4 : -4, vy: actor.kind === 1 ? -16 : 0 });
      changeState(actor, actor.previousState);
    }
  }
  actor.vx -= Math.sign(actor.vx);
  if (actor.vy <= 10) actor.vy++;
  actor.x += actor.vx;
  actor.y += actor.vy;
  const count = actor.scripted ? 1 : defeated(actor) ? 2 : actor.state === 0 ? 1 : actor.state === 3 ? 3 : 4;
  if (++actor.ticks > actor.period) { actor.ticks = 0; actor.frame = (actor.frame + 1) % count; }
  if (actor.kind !== 0) actor.timer++;
  if (!deferTerrain && !actor.removed && bodyCollision(actor.x, actor.y, sample, actor.body) === 1) {
    resolveTerrain(actor, oldX, oldY, sample, actor.body);
  }
  return shots;
}

function reward(player, sounds) {
  player.points++;
  if (player.points % 100 === 0) { player.lives++; sounds.push('BONUS.WAV'); }
}

export function defeatEnemy(player, actor, award = true) {
  if (actor.kind === 122) setBoosterBossState(actor, 5);
  else if (actor.kind === 33) setFlightBossState(actor, 4);
  else if (isFlightEnemy(actor.kind)) setFlightActorState(actor, 4);
  else if (actor.kind === 18) damageBoss(actor);
  else if (actor.kind === 32) setStage2BossState(actor, 7);
  else if (isStage2Enemy(actor.kind)) setStage2State(actor, STAGE2_ACTORS[actor.kind].deathState);
  else changeState(actor, actor.kind === 0 ? 3 : 4);
  const sounds = actor.kind === 122 ? [...BOOSTER_BOSS.damageSounds] : (actor.kind === 33 || isFlightEnemy(actor.kind)) ? ['PUNCH2.WAV'] : actor.kind === 32 ? [...STAGE2_BOSS.damageSounds] : isStage2Enemy(actor.kind) ? [...STAGE2_ACTORS[actor.kind].deathSound] : [actor.kind === 18 ? 'PUNCH2.WAV' : ['DEM-BOY.WAV', 'DEM-H2.WAV', 'PUNCH2.WAV'][actor.kind]];
  if (award) reward(player, sounds);
  return sounds;
}

export function hitCompanion(player, actor, ally) {
  if (!isEnemy(actor) || isFlightEnemy(actor.kind) || actor.removed || defeated(actor)) return [];
  const attacking = [2, 4, 5].includes(ally.slot) ? ally.state === 3 : ally.slot === 6 ? ally.state === 2 : ally.slot === 7;
  return attacking ? defeatEnemy(player, actor) : [];
}

function hurt(player, direction) {
  if (player.booster) hurtBooster(player);
  else {
    delete player.animationOverride;
    player.state = 'hurt';
    player.frame = player.ticks = 0;
  }
  if (direction === undefined) return;
  player.vx = direction * 16;
  player.vy = -5;
  player.facing = direction < 0 ? 1 : 0;
}

export function hitActor(player, actor, dog) {
  const sounds = [];
  if (actor.removed || actor.collected || player.dead) return sounds;
  if (actor.kind === 121) return hitProjectile(player, actor);
  // 0x407bf0 has no body-contact branch for this boss's node type 0x32.
  if (player.booster && actor.kind === 122) return sounds;
  if (player.flight && (actor.kind === 33 || isFlightEnemy(actor.kind))) {
    if (player.invulnerable > 0) return sounds;
    hurtFlight(player);
    return ['DEM-SHIN.WAV', ...defeatEnemy(player, actor)];
  }
  if (actor.kind === 11 || actor.kind === 12) {
    transformPlayer(player, actor.kind);
    actor.removed = true;
    return sounds;
  }
  const companionIndex = COMPANION_KINDS.indexOf(actor.kind);
  if ([10, 42, 43, 44, 45, 52, 53, 120].includes(actor.kind) || companionIndex >= 0) {
    actor.collected = true;
    actor.screenX = (dog?.screenX ?? 10) + 40;
    actor.screenY = (dog?.screenY ?? 400) + 40;
    actor.vy = -15;
    if (companionIndex >= 0) { player.companionItems[companionIndex]++; return ['ITEMSHO.WAV']; }
    sounds.push(...(JUNGLE_ITEMS[actor.kind]?.sounds ?? [actor.kind === 42 ? 'BONUS.WAV' : actor.kind === 45 ? 'CAN.WAV' : 'SE6.WAV']));
    reward(player, sounds);
    if (actor.kind === 42) { player.lives++; return sounds; }
    if (actor.kind === 120) { player.bananas++; return sounds; }
    if (JUNGLE_ITEMS[actor.kind]) { player.jungleItems[actor.kind - 52]++; return sounds; }
    player[({ 10: 'chocobi', 43: 'balls', 44: 'waterBombs', 45: 'cans' })[actor.kind]]++;
    return sounds;
  }
  if (!isEnemy(actor) || defeated(actor) || player.state === 'hurt' || player.state === 'boostHurt') return sounds;
  if (([18, 41].includes(actor.kind) && actor.state === 3) || (actor.kind === 32 && actor.state === 6) || (actor.kind === 59 && actor.state === 4)) {
    if (player.state === 'roachDash') { hurt(player); sounds.push('DEM-SHIN.WAV'); }
    else if (player.invulnerable === 0) { hurt(player, player.x + 38 < actor.x + actor.width / 2 ? -1 : 1); sounds.push('DEM-SHIN.WAV'); }
    return sounds;
  }
  // 0x40a837: descending and the player's top is above the enemy's top minus 20.
  if (player.state === 'roachDash' || (isAirState(player.state) && player.vy > 0 && player.y + player.body.top < actor.y + actor.body.top - 20)) {
    if (player.state !== 'roachDash') player.vy = -15;
    sounds.push(...defeatEnemy(player, actor));
  } else if (player.invulnerable === 0) {
    hurt(player, player.x + 38 < actor.x + Math.trunc(actor.width / 2) ? -1 : 1);
    sounds.push('DEM-SHIN.WAV');
  }
  return sounds;
}

export function createProjectile(shot) {
  if (shot.type === 67) {
    const data = FINAL_BOSS_SHOTS[67], [left, top, right, bottom] = data.body;
    const x = shot.x - 37, y = shot.y - 50;
    return {...shot, ...data.initial, x, y, oldX: x, oldY: y, body: {left, top, right, bottom}, exploded: false};
  }
  if (shot.type === 70) return createBoosterShot(shot);
  if (shot.type === 36 || shot.type === 37) return createFlightBullet(shot);
  if ([68, 93, 98, 99].includes(shot.type)) return createHeavyProjectile(shot);
  if ([35, 60, 94, 97].includes(shot.type)) {
    const data = shot.type === 35 ? FLIGHT_LASER : shot.type === 60 ? ROCK : shot.type === 94 ? FINAL_PROJECTILE : JUNGLE_PROJECTILE;
    const [left, top, right, bottom] = data.body;
    return { ...shot, width: data.width, height: data.height, body: { left, top, right, bottom }, oldX: shot.x, oldY: shot.y, bounces: 0, removed: false, exploded: false };
  }
  const ball = shot.type !== 95;
  return { ...shot, body: ball ? { left: 2, top: 2, right: 12, bottom: 12 } : { left: 0, top: 0, right: 18, bottom: 7 },
    oldX: shot.x, oldY: shot.y,
    width: shot.variant === 'boss2' ? 21 : shot.type === 66 ? 34 : ball ? 16 : 18,
    height: shot.variant === 'boss2' ? 21 : shot.type === 66 ? 36 : ball ? 16 : 7,
    bounces: 0, removed: false, exploded: false };
}

export function stepProjectile(shot, sample, deferTerrain = false, camera, player) {
  if (shot.removed) return;
  if ([60, 67, 94].includes(shot.type) && camera && Math.abs(shot.x - camera.x - 320) > 960) return;
  if (shot.type === 67) {
    shot.oldX = shot.x; shot.oldY = shot.y;
    if (++shot.ticks > 10) shot.removed = true;
    return;
  }
  if (shot.type === 70) {
    stepBoosterShot(shot, player, camera);
    if (!deferTerrain && !shot.removed) resolveProjectileTerrain(shot, sample);
    return;
  }
  if (shot.type === 36 || shot.type === 37) {
    stepFlightBullet(shot, camera);
    if (!deferTerrain && !shot.removed) resolveProjectileTerrain(shot, sample);
    return;
  }
  if ([35, 97].includes(shot.type) && camera && Math.abs(shot.x - camera.x - 320) > 960) { shot.removed = true; return; }
  if ([68, 93, 98, 99].includes(shot.type)) {
    stepHeavyProjectile(shot, camera);
    if (!deferTerrain && [68, 99].includes(shot.type) && !shot.removed) resolveProjectileTerrain(shot, sample);
    if (!deferTerrain && shot.type === 93) resolveEnemyTerrain(shot, sample);
    return;
  }
  shot.oldX = shot.x; shot.oldY = shot.y;
  if (shot.type === 94) shot.vy = 0;
  if (![35, 95].includes(shot.type) && shot.vy <= 10) shot.vy++;
  shot.x += shot.vx;
  if (shot.type !== 95) shot.y += shot.vy;
  if (!deferTerrain) resolveProjectileTerrain(shot, sample);
}

export function resolveProjectileTerrain(shot, sample) {
  if ([67, 98].includes(shot.type)) return;
  if ([68, 70, 99].includes(shot.type)) {
    if (bodyCollision(shot.x, shot.y, sample, shot.body)) { shot.removed = true; resolveEnemyTerrain(shot, sample); }
    return;
  }
  if (shot.type === 93) { resolveEnemyTerrain(shot, sample); return; }
  const { oldX, oldY } = shot;
  const hit = bodyCollision(shot.x, shot.y, sample, shot.body);
  if (!hit) return;
  if (shot.type === 60 && hit === 5) { shot.removed = true; return; }
  if (shot.type === 95) { shot.removed = true; return; }
  if (hit !== 1 && !(hit === 2 && (shot.variant === 'boss2' || [35, 36, 37, 60, 94, 97].includes(shot.type)))) return;
  const bounce = (axis) => {
    shot[axis] = -shot[axis];
    if (++shot.bounces === ([35, 36, 37, 66, 97].includes(shot.type) ? 1 : 3) && shot.type !== 60) {
      shot.removed = true;
      if (shot.type === 66) { shot.exploded = true; shot.splash = { x: shot.x, y: shot.y }; }
    }
  };
  if (hit === 2) {
    for (let rise = 0; rise < 26; rise++) {
      if (!bodyCollision(shot.x, shot.y - rise, sample, shot.body)) { shot.y -= rise; shot.vy += 2; bounce('vy'); return; }
    }
    for (let y = shot.y; y >= oldY; y--) {
      if (!bodyCollision(shot.x, y, sample, shot.body)) { shot.y = y; bounce('vy'); break; }
    }
    return;
  }
  for (let rise = 0; rise < 26; rise++) {
    if (!bodyCollision(shot.x, shot.y - rise, sample, shot.body)) { shot.y -= rise; bounce('vy'); return; }
  }
  if (shot.x !== oldX) {
    const direction = Math.sign(oldX - shot.x);
    for (let x = shot.x; direction > 0 ? x <= oldX : x >= oldX; x += direction) {
      if (!bodyCollision(x, oldY, sample, shot.body)) { shot.x = x; bounce('vx'); break; }
    }
  }
  if (shot.y !== oldY) {
    const direction = Math.sign(oldY - shot.y);
    for (let y = shot.y; direction > 0 ? y <= oldY : y >= oldY; y += direction) {
      if (!bodyCollision(shot.x, y, sample, shot.body)) { shot.y = y; bounce('vy'); break; }
    }
  }
}

export function createSplash(x, y) {
  return { type: 'splash', x: x - 37, y: y - 50, body: { left: 14, top: 12, right: 106, bottom: 70 }, ticks: 0, removed: false };
}

export function stepSplash(splash) {
  if (++splash.ticks > 10) splash.removed = true;
}

export function hitWeapon(player, actor, shot) {
  if (!isEnemy(actor) || actor.removed) return [];
  if (shot.type === 35 && ([20, 21, 33, 122].includes(actor.kind) || isFlightEnemy(actor.kind)) && defeated(actor)) {
    if ([20, 21, 122].includes(actor.kind)) shot.removed = true;
    return [];
  }
  // Native splash contacts reset the death animation and can award points on consecutive ticks.
  const sounds = defeatEnemy(player, actor);
  if (shot.type !== 'splash') {
    shot.removed = true;
    if (shot.type === 66) { shot.exploded = true; shot.splash = { x: shot.x, y: shot.y }; }
  }
  return sounds;
}

export function hitProjectile(player, shot) {
  if (shot.type === 67) {
    if (shot.removed || player.dead || player.state === 'hurt') return [];
    hurt(player);
    return ['DEM-SHIN.WAV'];
  }
  if (player.flight && [36, 37].includes(shot.type)) {
    if (shot.removed || player.dead || player.state === 'flightHurt') return [];
    shot.removed = true;
    if (player.invulnerable > 0) return [];
    hurtFlight(player);
    return ['DEM-SHIN.WAV'];
  }
  if (shot.removed || player.dead || player.state === 'hurt' || player.state === 'boostHurt' || player.invulnerable > 0) return [];
  const direction = Math.sign(shot.vx) || (player.x + 38 < shot.x + Math.trunc(shot.width / 2) ? -1 : 1);
  hurt(player, direction);
  if (shot.type !== 60) shot.removed = true;
  return ['DEM-SHIN.WAV'];
}

export function createWorld(definitions, map = null, randomSeed = 1, minigameState = {}) {
  const world = {
    map, flightStopped: false, spawnCell: null, falling: false,
    actors: definitions.filter((d) => isActorKind(d.kind)).map((d) => ({
      ...createActor(d.kind, d.x, d.y), column: d.column, row: d.row, active: false, born: false,
    })),
    surfaces: definitions.filter((d) => isSurfaceKind(d.kind)).map((d) => ({
      ...createSurface(d.kind, d.x, d.y), column: d.column, row: d.row, active: false, born: false,
    })),
    markers: definitions.filter((d) => d.kind >= 13 && d.kind <= 17).map((d) => ({ ...d, body: MARKER_BODY, active: false, born: false })),
    // shortcut: audit RNG calls from remaining actors when their behavior is restored.
    randomSeed, card: minigameState.card, puzzle: minigameState.puzzle,
    projectiles: [], splashes: [], rabbits: [], npcs: [], event: null, inventory: null, minigame: null, stageEntry: null,
    companion: null, dog: createDog(), nextSpawnOrder: 0, playedEvents: new Set(), stageComplete: false, pairedBossesRemaining: 2, finalBossesRemaining: 2,
    activators: definitions.filter((d) => [90, 92].includes(d.kind)).map((d) => ({ ...d, active: false, ticks: 0, removed: false })),
    triggers: definitions.filter((d) => [65, 70, 71, 72, 74, 76, 77, 85, 86, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118].includes(d.kind)).map((d) => ({ ...d, active: false, born: false, removed: false,
      body: { left: d.kind === 116 ? -80 : d.kind === 118 ? -50 : 0, top: -320, right: 32, bottom: 320 } })),
  };
  const runtime = new Map([...world.actors, ...world.surfaces, ...world.markers, ...world.triggers, ...world.activators]
    .map(object => [`${object.column},${object.row}`, object]));
  world.spawnCells = new Map(definitions.map(object => {
    const key = `${object.column},${object.row}`;
    return [key, runtime.get(key) ?? object];
  }));
  return world;
}

export function restartWorld(previous, definitions) {
  const world = createWorld(definitions, previous.map, previous.randomSeed, previous);
  // Same-stage 0x427900 does not call the stage resource initializer or reset dialogue guards.
  world.playedEvents = new Set(previous.playedEvents);
  world.pairedBossesRemaining = previous.pairedBossesRemaining;
  world.finalBossesRemaining = previous.finalBossesRemaining;
  world.dog = previous.dog;
  // The house prop's factory 0x427301 does not instantiate it after its dialogue has played.
  for (const trigger of world.triggers) if (trigger.kind === 118 && world.playedEvents.has(118)) trigger.removed = true;
  return world;
}

export function openMinigame(world, kind) {
  const previous = kind === 'card' ? world.card : kind === 'puzzle' ? world.puzzle : undefined;
  world.minigame = createMinigame(kind, world.randomSeed, previous);
  world.minigame.fromMenu = false;
  if (kind === 'card') { world.card = world.minigame; world.randomSeed = world.card.randomSeed; }
  if (kind === 'puzzle') world.puzzle = world.minigame;
  return world.minigame;
}

export function cameraSpawner(world, player, camera, now, sounds) {
  return ({secondary, column, row}) => {
    if (secondary && (column <= 0 || row <= 0 || column >= world.map.width || row >= world.map.height)) return world.flightStopped;
    const key = `${column},${row}`, object = world.spawnCells.get(key);
    if (!object || IGNORED_KINDS.includes(object.kind) || SECONDARY_KINDS.includes(object.kind) !== secondary) return world.flightStopped;
    world.spawnCells.delete(key);
    if (object.active || object.removed) return world.flightStopped;
    object.active = object.born = true;
    object.spawnOrder = world.nextSpawnOrder++;
    sounds.push(...(STAGE2_ACTORS[object.kind]?.spawnSounds ?? []));
    if (object.kind === 121) sounds.push(...ROCK.spawnSounds);
    if (object.kind === 41) world.finalBossesRemaining = 2;
    if (object.kind === 33) world.flightStopped = true;
    if (object.kind === 32 && !world.playedEvents.has('boss2Intro')) {
      world.playedEvents.add('boss2Intro');
      world.event = createEvent('boss2Intro', player, camera, now, object);
      world.event.born = true; camera.scrollMode = 0;
      sounds.push(...world.event.startSounds);
    }
    return world.flightStopped;
  };
}

export function cameraActive(world) {
  return !world.ending && !(world.stageEntry && !world.stageEntry.finished) && !(world.minigame && !world.minigame.finished);
}

export function initializeWorldCamera(world, player, camera, now = 0) {
  const sounds = [], spawn = cameraSpawner(world, player, camera, now, sounds);
  camera.column = Math.trunc(camera.x / 32); camera.row = Math.trunc(camera.y / 32);
  camera.offsetX = camera.x - camera.column * 32; camera.offsetY = camera.y - camera.row * 32;
  camera.scrollMotion ??= 0;
  for (const cell of initialCameraScan(camera, world.map)) spawn(cell);
  world.spawnCell = {column:camera.column,row:camera.row};
  // Map construction finishes inside the old frame; its cleanup clears these birth flags.
  for (const object of [...world.actors, ...world.surfaces, ...world.markers, ...world.triggers, ...world.activators]) object.born = false;
  if (world.event) world.event.born = false;
  return sounds;
}

export function advanceWorldCamera(world, player, camera, stage, now = 0) {
  const sounds = [];
  advanceCamera(camera, player, world.map, stage, world.flightStopped, cameraSpawner(world, player, camera, now, sounds));
  world.spawnCell = {column:camera.column,row:camera.row};
  return sounds;
}

function consumeSpawn(world, object) { world.spawnCells.delete(`${object.column},${object.row}`); }
function queueSpawn(world, object, column, row) {
  const key = `${column},${row}`, occupied = world.spawnCells.get(key);
  if (occupied && !occupied.active && !occupied.removed) { object.removed = true; return false; }
  object.column = column; object.row = row;
  world.spawnCells.set(key, object);
  return true;
}

export function stepWorld(world, player, input, camera, sample, now = 0) {
  if (world.ending) {
    const previousMode = world.ending.mode;
    const sounds = stepEnding(world.ending, input.fire, now).sounds;
    if (previousMode === 'movie' && world.ending.mode === 'credits') {
      for (const list of [world.actors, world.surfaces, world.npcs, world.markers, world.triggers, world.activators, world.projectiles, world.splashes, world.rabbits]) {
        for (const object of list) object.removed = true;
      }
      world.event = world.inventory = world.minigame = world.companion = null;
    }
    return world.ending.mode === 'movie' ? resolveWorldContacts(world, player, camera, sample, now, sounds) : sounds;
  }
  if (world.stageComplete) return [];
  const sounds = [];
  if (world.stageEntry && !world.stageEntry.finished) {
    sounds.push(...stepStageEntry(world.stageEntry, input.fire, now));
    if (!world.stageEntry.finished) return resolveWorldContacts(world, player, camera, sample, now, sounds);
    if (world.stageEntry.transitions > 0) { world.stageComplete = true; return sounds; }
  }
  if (world.minigame && !world.minigame.finished) {
    const effects = stepMinigame(world.minigame, { ...input, up: input.jump }, now);
    if (['mole', 'card', 'puzzle'].includes(world.minigame.kind)) world.randomSeed = world.minigame.randomSeed;
    sounds.push(...effects.sounds);
    if (world.minigame.fromMenu) return sounds;
    if (!world.minigame.finished) return resolveWorldContacts(world, player, camera, sample, now, sounds);
    // Priority5 restores groups6/7/8 before the scheduler reaches them on this same tick.
  }
  if (world.inventory && !world.inventory.removed) {
    // shortcut: overlapping modals still need per-group activation and draw-order traces.
    const busy = Boolean(world.companion) || world.dog.state !== 0;
    resolveWorldContacts(world, player, camera, sample, now, sounds);
    // The inventory node follows both contact managers in priority9; closing resumes on the next tick.
    const summon = stepInventory(world.inventory, { up: input.jump, down: input.down, enter: input.enter }, player, busy);
    if (summon?.slot === 4) activateDog(world.dog);
    else if (summon) {
      world.companion = createCompanion(summon.slot, summon.cost, camera);
      sounds.push(...world.companion.startSounds);
    }
    return sounds;
  }
  const emitted = [];
  const column = camera.column ?? Math.floor(camera.x / 32), row = camera.row ?? Math.floor(camera.y / 32);
  const currentCell = { column, row }, previousCell = world.spawnCell;
  world.spawnCell = currentCell;
  const canSpawn = (object) => entersSpawnWindow(object, currentCell, previousCell, world.map);
  for (const marker of world.markers) {
    if (marker.removed) continue;
    if (marker.active && (Math.abs(marker.x - camera.x - 320) > 2240 || Math.abs(marker.y - camera.y - 240) > 1680)) {
      queueSpawn(world, marker, marker.column, marker.row); marker.active = false;
    }
    if (!marker.active && canSpawn(marker)) { marker.active = marker.born = true; consumeSpawn(world, marker); }
  }
  for (const trigger of world.triggers) {
    if (!trigger.active && !trigger.removed && canSpawn(trigger)) { trigger.active = trigger.born = true; consumeSpawn(world, trigger); }
  }
  for (const trigger of world.activators) {
    if (trigger.removed) continue;
    if (!trigger.active) {
      if (canSpawn(trigger)) { trigger.active = true; consumeSpawn(world, trigger); }
    } else if (trigger.born) continue;
    else if (trigger.kind === 92) { enterFall(player); world.falling = true; trigger.removed = true; }
    else if (++trigger.ticks === 20) { player.moveEnabled = true; trigger.removed = true; }
  }
  if (!world.event?.born && [86, 112, 114, 116].includes(world.event?.kind)) sounds.push(...advanceEvent(world.event, player, input.enter, now));
  for (const actor of world.event?.pendingActors?.splice(0) ?? []) {
    actor.spawnOrder = world.nextSpawnOrder++;
    if (actor.kind === 41) world.finalBossesRemaining = 2;
    world.actors.push(actor);
  }
  world.npcs.push(...(world.event?.pendingNpcs?.splice(0) ?? []));
  const entities = [...world.actors, ...world.surfaces];
  const enemies = world.actors.filter(actor => actor.active && actor.born && !actor.removed && isEnemy(actor));
  if (world.event?.kind === 112 && world.event.removed) {
    finishEvent(world.event, player);
    world.event = null; world.npcs = []; world.stageComplete = true;
    return sounds;
  }
  for (const actor of entities) {
    if (actor.removed) continue;
    if (actor.born) continue;
    if (!actor.active) {
      if (canSpawn(actor)) {
        actor.active = actor.born = true; consumeSpawn(world, actor);
        actor.spawnOrder = world.nextSpawnOrder++;
        sounds.push(...(STAGE2_ACTORS[actor.kind]?.spawnSounds ?? []));
        if (actor.kind === 121) sounds.push(...ROCK.spawnSounds);
        if (actor.kind === 41) world.finalBossesRemaining = 2;
        if (actor.kind === 33) world.flightStopped = true;
        if (actor.kind === 32 && !world.playedEvents.has('boss2Intro')) {
          world.playedEvents.add('boss2Intro');
          world.event = createEvent('boss2Intro', player, camera, now, actor);
          sounds.push(...world.event.startSounds);
        }
        if (isEnemy(actor)) enemies.push(actor);
      }
      continue;
    }
    if (!isFlightActor(actor.kind) && !isJungleBoss(actor.kind) && !isFinalBoss(actor.kind) && ![18, 20, 21, 22, 23, 32, 33, 34, 48, 51, 93, 95, 119, 121, 122].includes(actor.kind) && !actor.collected && Math.abs(actor.x - camera.x - 320) > 960) {
      // 0x4262e0 puts an offscreen actor back in the map at its current position.
      const column = Math.trunc((actor.x + Math.trunc(actor.width / 2)) / 32), row = Math.trunc((actor.y + actor.height) / 32);
      if (!queueSpawn(world, actor, column, row)) continue;
      const surface = isSurfaceKind(actor.kind);
      const kind = actor.bridge ? actor.state === 4 ? 102 : 101 : surface && !actor.spring && actor.kind !== 103 ? [5, 3, 4, 49, 50][actor.state] : actor.kind;
      const recreated = (surface ? createSurface : createActor)(kind, actor.x, actor.y);
      // Native requeue stores the old image's bottom/center; the next factory uses the new kind's dimensions.
      recreated.x += Math.trunc(actor.width / 2) - Math.trunc(recreated.width / 2);
      recreated.y += actor.height - recreated.height;
      recreated.oldX = recreated.x; recreated.oldY = recreated.y;
      Object.assign(actor, recreated, { active: false });
      continue;
    }
    if (isEnemy(actor)) enemies.push(actor);
    if (isSurfaceKind(actor.kind)) stepSurface(actor, sample, true);
    else emitted.push(...stepActor(actor, player, sample, true, camera, world));
    if (isJungleBoss(actor.kind) && actor.removed && actor.health < 1) world.pairedBossesRemaining--;
    if (isFinalBoss(actor.kind) && actor.removed && actor.health < 1) world.finalBossesRemaining--;
    if (isStage2Enemy(actor.kind)) sounds.push(...actor.sounds);
    if (actor.kind === 122) {
      sounds.push(...actor.sounds);
      if (actor.exitMovie) world.stageEntry = createStageEntry('boosterExit');
    }
    if (actor.kind === 32 && actor.deathScene && !world.playedEvents.has('boss2Death')) {
      world.playedEvents.add('boss2Death');
      world.event = createEvent('boss2Death', player, camera, now);
      sounds.push(...world.event.startSounds);
    }
    if (actor.requeue) {
      const { x, y } = actor.requeue;
      const column = Math.trunc((x + Math.trunc(actor.width / 2)) / 32), row = Math.trunc((y + actor.height) / 32);
      if (!queueSpawn(world, actor, column, row)) continue;
      Object.assign(actor, createActor(actor.kind, x, y), { active: false });
    }
    if (actor.levelComplete) { world.stageComplete = true; return sounds; }
  }
  for (const shot of world.projectiles) {
    if ([36, 37].includes(shot.type) || Math.abs(shot.x - camera.x - 320) <= 960) stepProjectile(shot, sample, true, camera, player);
    else if ([35, 68, 70, 93, 97, 98, 99].includes(shot.type)) shot.removed = true;
  }
  for (const splash of world.splashes) stepSplash(splash);
  for (const rabbit of world.rabbits) stepRabbit(rabbit, camera);
  if (world.event && !world.event.born && ![86, 112, 114, 116, 118].includes(world.event.kind)) sounds.push(...advanceEvent(world.event, player, input.enter, now));
  for (const npc of world.npcs) stepEventNpc(npc, camera, sample, true);
  // Native target searches still see actors marked for removal until end-of-frame cleanup.
  enemies.sort((a, b) => a.spawnOrder - b.spawnOrder);
  // Native companion searches and area attacks exclude flight node types 0x1f–0x21.
  const companionTargets = enemies.filter((actor) => !isFlightEnemy(actor.kind));
  if (world.companion) {
    const effects = stepCompanion(world.companion, player, camera, companionTargets);
    sounds.push(...effects.sounds);
    if (effects.clear) for (const enemy of companionTargets) sounds.push(...defeatEnemy(player, enemy, false));
    if (effects.rabbit) world.rabbits.push(createRabbit(effects.rabbit));
  }
  const exitRequested = world.event?.exitRequested || (world.stageEntry && !world.stageEntry.finished);
  if (!exitRequested) {
    const oldScreenX = player.x - camera.x, oldScreenY = player.y - camera.y;
    const scriptedPlayer = Boolean(world.event && !world.event.removed) || world.falling;
    if (world.event?.kind === 118) sounds.push(...stepIntro(world.event, player, input.enter, now, sample, true));
    else if (world.event && !world.event.removed) stepEventPlayer(player, sample, true);
    else if (world.falling) world.falling = stepFall(player, sample);
    else if (player.booster) emitted.push(...stepBooster(player, { ...input, up: input.jump }, camera, world.map, sample, true));
    else if (player.flight) emitted.push(...stepFlight(player, { ...input, up: input.jump }, camera, world.map, world.flightStopped));
    else {
      stepPlayer(player, input, sample, emitted, true, camera);
      if (player.dead || player.respawnRequested) return sounds;
      if (!player.dead && world.pairedBossesRemaining === 0) {
        world.pairedBossesRemaining = 2;
        world.stageComplete = true;
        return sounds;
      }
      if (!player.dead && world.finalBossesRemaining === 0) {
        world.finalBossesRemaining = 2;
        world.ending = createEnding(now);
        sounds.push(...world.ending.startSounds);
      }
    }
    if (player.dead || player.respawnRequested) return sounds;
    player.screenX = scriptedPlayer ? oldScreenX : player.oldX - camera.x;
    player.screenY = scriptedPlayer ? oldScreenY : player.oldY - camera.y;
    stepDog(world.dog, player, camera, companionTargets);
  }
  return resolveWorldContacts(world, player, camera, sample, now, sounds, emitted);
}

function resolveWorldContacts(world, player, camera, sample, now, sounds = [], emitted = []) {
  const entities = [...world.actors, ...world.surfaces];
  const enemies = world.actors.filter(actor => actor.active && !actor.removed && isEnemy(actor)).sort((a,b) => a.spawnOrder - b.spawnOrder);
  // Native priority 9 resolves terrain after priority 6 actors and priority 8 player/HUD updates.
  if (resolveTerrain(player, player.oldX, player.oldY, sample) === 5) sounds.push('DEM-SHIN.WAV');
  for (const actor of entities) {
    if (!actor.active || actor.born || actor.removed || actor.collected) continue;
    if (actor.kind === 121) { resolveProjectileTerrain(actor, sample); continue; }
    if (!isEnemy(actor) && (!isSurfaceKind(actor.kind) || actor.spring)) continue;
    if (isWoodSurface(actor.kind) || isFlightEnemy(actor.kind) || isStage2Enemy(actor.kind) || [32, 33, 122].includes(actor.kind)) { resolveEnemyTerrain(actor, sample); continue; }
    if (bodyCollision(actor.x, actor.y, sample, actor.body) === 1) resolveTerrain(actor, actor.oldX, actor.oldY, sample, actor.body);
  }
  for (const npc of world.npcs) {
    if (npc.born || npc.removed) continue;
    if (npc.scene) { resolveEnemyTerrain(npc, sample); continue; }
    if (!npc.removed && bodyCollision(npc.x, npc.y, sample, npc.body) === 1) resolveTerrain(npc, npc.oldX, npc.oldY, sample, npc.body);
  }
  for (const shot of world.projectiles) if (!shot.removed) resolveProjectileTerrain(shot, sample);
  if (player.openInventory) {
    player.openInventory = false;
    world.inventory = { ...(world.inventory ?? createInventory(player.selectedItem)), cursor: player.selectedItem, removed: false };
  }
  // Native player contacts follow registration order across enemies and platforms.
  for (const actor of [...entities].sort((a, b) => (a.spawnOrder ?? 0) - (b.spawnOrder ?? 0))) {
    if (!actor.active || actor.born || actor.removed || actor.collected) continue;
    if (actor.body && overlaps(player, actor)) {
      if (isSurfaceKind(actor.kind)) {
        if (!player.dead) sounds.push(...touchSurface(player, actor));
      } else if (!player.dead && [87, 123, 124, 125, 126].includes(actor.kind) && (!world.minigame || world.minigame.finished)) {
        openMinigame(world, actor.kind === 125 ? 'puzzle' : actor.kind === 126 ? 'card' : actor.kind === 87 ? 'mole' : actor.kind === 123 ? 'car' : 'flag');
        actor.removed = true;
      } else sounds.push(...hitActor(player, actor, world.dog));
    }
  }
  for (const actor of world.actors) {
    if (actor.active && !actor.born && !actor.removed && isEnemy(actor)) {
      for (const marker of world.markers) if (marker.active && !marker.born && overlaps(actor, marker)) sounds.push(...(turnActor(actor, marker.kind - 13) ?? []));
    }
  }
  for (const enemy of enemies) {
    if (enemy.born) continue;
    if (world.companion && !world.companion.removed && overlaps(enemy, world.companion)) sounds.push(...hitCompanion(player, enemy, world.companion));
    if (overlaps(enemy, world.dog)) sounds.push(...hitCompanion(player, enemy, world.dog));
  }
  for (const shot of world.projectiles) {
    if (shot.removed) continue;
    if ([35, 65, 66].includes(shot.type)) {
      for (const actor of world.actors) {
        if (actor.active && !actor.born && isEnemy(actor) && overlaps(actor, shot)) sounds.push(...hitWeapon(player, actor, shot));
      }
    } else if (overlaps(player, shot)) sounds.push(...hitProjectile(player, shot));
  }
  for (const splash of world.splashes) {
    if (splash.removed) continue;
    for (const actor of world.actors) {
      if (actor.active && !actor.born && isEnemy(actor) && overlaps(actor, splash)) sounds.push(...hitWeapon(player, actor, splash));
    }
  }
  for (const surface of world.surfaces) {
    if (!surface.active || surface.born) continue;
    if (!surface.spring && !surface.bridge && surface.kind !== 103) {
      for (const marker of world.markers) if (marker.active && !marker.born && overlaps(surface, marker)) surface.state = marker.kind - 13;
    }
  }
  world.splashes = world.splashes.filter((splash) => !splash.removed);
  world.rabbits = world.rabbits.filter((rabbit) => !rabbit.removed);
  world.splashes.push(...world.projectiles.filter((shot) => shot.exploded).map((shot) => createSplash(shot.splash.x, shot.splash.y)));
  for (const shot of world.projectiles) if (shot.type === 98 && shot.removed) sounds.push('CHULFUCK.WAV');
  world.projectiles = world.projectiles.filter((shot) => !shot.removed);
  world.projectiles.push(...emitted.map(createProjectile));
  for (const actor of entities) actor.born = false;
  for (const marker of world.markers) marker.born = false;
  for (const npc of world.npcs) npc.born = false;
  if (world.companion?.removed) world.companion = null;
  if (world.event?.removed || world.event?.finished) {
    const nextMovie = world.event.exitRequested;
    if (world.event.kind === 76) world.flightStopped = false;
    if (world.event.kind !== 118) finishEvent(world.event, player);
    world.event = null;
    if (nextMovie) world.stageEntry = createStageEntry('stage2Exit');
  } else if (!world.event && !player.dead) {
    const trigger = world.triggers.find((t) => t.active && !t.born && !t.removed && !world.playedEvents.has(t.kind) && overlaps(player, t));
    if (trigger) {
      world.playedEvents.add(trigger.kind);
      if (trigger.kind === 76) world.flightStopped = true;
      if (trigger.kind === 118) world.event = createIntro(player, trigger, now);
      else {
        const enemy = trigger.kind === 117 ? { ...createActor(0, camera.x + 600, player.y - 30), active: true, born: false, spawnOrder: world.nextSpawnOrder++ } : null;
        world.event = createEvent(trigger.kind, player, camera, now, enemy);
        for (const actor of world.event.enemies ?? []) {
          actor.born = false; // Native end-of-frame cleanup also clears actors created by priority-9 contacts.
          actor.spawnOrder = world.nextSpawnOrder++;
          world.actors.push(actor);
        }
        if (enemy) world.actors.push(enemy);
        for (const npc of world.event.npcs) { npc.born = false; world.npcs.push(npc); }
        sounds.push(...world.event.startSounds);
      }
    }
  }
  for (const trigger of [...world.triggers, ...world.activators]) trigger.born = false;
  if (world.event) world.event.born = false;
  return sounds;
}
