import { resolveTerrain, bodyCollision, playerAnimation, playerSprite } from './game.js';
import { STAGE2_EVENTS, STAGE2_POSES } from './stage2-event-data.js';
import { BOSS2_SCENES, BOSS2_POSES } from './stage2-boss-scene-data.js';
import { FLIGHT_EVENTS, FLIGHT_POSES } from './flight-event-data.js';
import { setFlightState } from './flight.js';
import { setStage2BossState } from './stage2-boss.js';
import { createStage2Enemy, setStage2State, resolveEnemyTerrain } from './stage2-actors.js';
import { JUNGLE_SCENE, JUNGLE_POSES } from './jungle-boss-data.js';
import { STAGE6_EXIT, STAGE6_EXIT_POSE } from './stage6-exit-data.js';
import { FINAL_SCENES, FINAL_POSES } from './final-scene-data.js';
const stage2Scenes = { ...STAGE2_EVENTS, ...BOSS2_SCENES, ...FLIGHT_EVENTS, ...FINAL_SCENES, 86: JUNGLE_SCENE, 112: STAGE6_EXIT };

// SHIN.EXE 0x443e30 / 0x436130: elapsed time must be strictly greater than each boundary.
const dialogue = { 65: [
  [3930, 21, -1, 0, [31, 29, 30]],
  [7010, 22, 0, 1, [32, 30]],
  [13930, 23, 0, 0, [33, 29, 30]],
  [19450, 22, 1, 1, [34, 29]],
  [25830, 24, 1, 0, [35, 29, 30]],
  [33450, 22, 0, 1, [36, 30]],
  [36060, 25, 0, 0, [37]],
  [37650, null, 2, 1, [38]],
], 117: [
  [740, 108, -1, 0, ['44']],
  [2790, 109, -1, 0, ['46']],
  [4470, 110, -1, 0, ['47-1']],
  [7480, 108, 0, 5, []],
  [8480, 111, -1, 0, ['47-2']],
] };
export const EVENT_SOUNDS = { 65: Array.from({ length: 10 }, (_, i) => `${i + 29}.WAV`),
  117: ['43.WAV', '44.WAV', '46.WAV', '47-1.WAV', '47-2.WAV'],
  ...Object.fromEntries(Object.entries(stage2Scenes).map(([kind, data]) => [kind, [...data.startSounds, ...data.timeline.flatMap((step) => step[2])]])) };

function pose(actor, state, poses = null) {
  delete actor.animationOverride;
  actor.state = state;
  actor.frame = actor.ticks = 0;
  const animation = typeof state === 'string' && (poses?.[state.slice(5)] ?? STAGE2_POSES[state.slice(5)] ?? BOSS2_POSES[state.slice(5)] ?? FLIGHT_POSES[state.slice(5)]);
  if (animation) actor.animationOverride = animation;
}

function sceneActor(kind, data, player) {
  const actor = {...createStage2Enemy(kind, player.x + data.offsetX, player.y + data.offsetY),
    scripted: true, talk: data, active: true, born: true};
  setStage2State(actor, data.initialState ?? data.initial.state);
  return actor;
}

export function createEvent(kind, player, camera, now, enemy = null) {
  const stage2 = stage2Scenes[kind];
  if ((!dialogue[kind] && !stage2) || ([117, 'boss2Intro'].includes(kind) && !enemy)) throw new Error(`Invalid event: ${kind}`);
  const event = { kind, enemy, phase: 0, startedAt: now, enterHeld: false, removed: false, previousState: player.state,
    skippable: stage2?.canSkip !== false, exitRequested: false,
    startSounds: stage2?.startSounds ?? (kind === 65 ? ['29.WAV', '30.WAV'] : ['43.WAV']),
    npcs: kind !== 65 ? [] : [[32, 25, 67, 87], [12, 10, 46, 74], [11, 8, 46, 96]].map(([left, top, right, bottom], index) => ({
      index, x: camera.x + 640 + index * 80, y: player.y - 30, vx: 0, vy: 0,
      state: 0, frame: 0, ticks: 0, removed: false, body: { left, top, right, bottom },
    })) };
  delete player.animationOverride;
  pose(player, stage2 ? `scene${stage2.initialState}` : kind === 65 ? 'scene20' : 'scene107', kind === 86 ? JUNGLE_POSES : FINAL_SCENES[kind] ? FINAL_POSES : null);
  if (kind === 112) {
    player.animationOverride = STAGE6_EXIT_POSE;
    event.enemies = STAGE6_EXIT.cast.map(data => sceneActor(data.kind, data, player));
  }
  if (kind === 114) event.enemies = [sceneActor(34, stage2.enemies[34], player)];
  if (kind === 116) { event.enemies = []; event.pendingActors = []; event.pendingNpcs = []; }
  if (kind === 86) {
    event.enemies = [39, 40].map((type, index) => {
      const actor = { ...createStage2Enemy(type, player.x + 340 + index * 60, player.y - 200), scripted: true, talk: JUNGLE_SCENE.enemies[type], active: true, born: true };
      setStage2State(actor, 5);
      return actor;
    });
  }
  if (kind === 117) { pose(enemy, 4); enemy.period = 10; enemy.scripted = true; }
  if (kind === 'boss2Intro') { enemy.talk = stage2.enemy; enemy.scripted = true; setStage2BossState(enemy, 8); }
  return event;
}

function endEvent(event, player, skipped) {
  if ([114, 116].includes(event.kind)) {
    for (const actor of event.enemies) { actor.scripted = false; setStage2State(actor, 1); }
    if (event.prop) event.prop.removed = true;
  }
  if (event.kind === 86) {
    for (const actor of event.enemies) { actor.scripted = false; setStage2State(actor, player.x < actor.x ? 1 : 2); }
  }
  if (event.kind === 65) {
    for (const npc of skipped ? event.npcs : [event.npcs[2]]) pose(npc, 0);
  } else if (event.kind === 117) {
    pose(event.enemy, 0);
    event.enemy.period = 100;
    event.enemy.scripted = false;
  } else if (event.kind === 'boss2Intro') {
    event.enemy.scripted = false;
    setStage2BossState(event.enemy, player.x < event.enemy.x ? 1 : 2);
  }
  if (FLIGHT_EVENTS[event.kind]) setFlightState(player, 18);
  else pose(player, 'idle');
  event.removed = true;
  event.exitRequested = Boolean(stage2Scenes[event.kind]?.exitMovie);
}

export function advanceEvent(event, player, enter, now) {
  if (event.removed) return [];
  if (enter && event.skippable) event.enterHeld = true;
  else if (event.enterHeld) {
    endEvent(event, player, true);
    return [];
  }
  const sounds = [];
  const stage2 = stage2Scenes[event.kind];
  if (stage2) {
    while (event.phase < stage2.timeline.length && now - event.startedAt > stage2.timeline[event.phase][0]) {
      const [, state, clips, enemyState] = stage2.timeline[event.phase++];
      if (state !== null) pose(player, `scene${state}`, event.kind === 86 ? JUNGLE_POSES : FINAL_SCENES[event.kind] ? FINAL_POSES : null);
      if (event.kind === 112) for (const actor of event.enemies.slice(0, 2)) setStage2State(actor, 11);
      if (event.kind === 116) {
        if (event.phase === 1) {
          event.enemies = [59, 41].map(kind => sceneActor(kind, stage2.enemies[kind], player));
          event.pendingActors.push(...event.enemies);
        }
        const [boss59, boss41] = event.enemies;
        if (event.phase === 2) setStage2State(boss59, 7);
        if ([3, 6].includes(event.phase)) setStage2State(boss41, 7);
        if ([4, 5].includes(event.phase)) boss41.facing = 1;
        if (event.phase === 5) setStage2State(boss59, 8);
        if (event.phase === 6) setStage2State(boss59, 9);
        if (event.phase === 8) {
          setStage2State(boss41, 9);
          const data = stage2.prop, x = player.x + data.offsetX, y = player.y + data.offsetY;
          const [left, top, right, bottom] = data.body;
          event.prop = {...data.initial, x, y, oldX: x, oldY: y, born: true, scene: data, body: {left, top, right, bottom}};
          event.npcs.push(event.prop); event.pendingNpcs.push(event.prop);
        }
      }
      if (event.kind === 86) enemyState.forEach((value, index) => { if (value !== null) setStage2State(event.enemies[index], value); });
      else if (enemyState !== undefined && enemyState !== null) setStage2BossState(event.enemy, enemyState);
      sounds.push(...clips);
      if (stage2.singleStep) return sounds;
    }
    if (event.phase === stage2.timeline.length && now - event.startedAt > stage2.end) endEvent(event, player, false);
    return sounds;
  }
  const timeline = dialogue[event.kind];
  while (event.phase < timeline.length && now - event.startedAt > timeline[event.phase][0]) {
    const [, state, npc, npcState, clips] = timeline[event.phase++];
    if (state !== null) pose(player, `scene${state}`);
    if (npc >= 0) pose(event.kind === 117 ? event.enemy : event.npcs[npc], npcState);
    sounds.push(...clips.map((clip) => `${clip}.WAV`));
  }
  if (event.phase === timeline.length && now - event.startedAt > (event.kind === 65 ? 39650 : 12160)) {
    endEvent(event, player, false);
  }
  return sounds;
}

export function finishEvent(event, player) {
  // 0x444170 / 0x4362c0 restore the state after installing the idle animation table.
  player.animationOverride = { ...playerAnimation(player) };
  player.state = event.kind === 70 && event.previousState === 'hurt' ? 'idle' : event.previousState;
}

export function stepEventPlayer(player, sample, deferTerrain = false) {
  const oldX = player.x, oldY = player.y;
  const state = Number(player.state.slice(5));
  if (FLIGHT_POSES[state]) [player.vx, player.vy] = FLIGHT_POSES[state].velocity;
  else {
    if (state === 20) player.vx = 2;
    else if (player.state.startsWith('scene') && player.animationOverride?.zeroHorizontal !== false) player.vx = 0;
    player.vx -= Math.sign(player.vx);
    if (player.vy <= 10) player.vy++;
  }
  player.x += player.vx;
  player.y += player.vy;
  const animation = playerAnimation(player);
  if (++player.ticks > animation.period) {
    player.ticks = 0;
    player.frame = (player.frame + 1) % animation.count;
  }
  if (!deferTerrain) resolveTerrain(player, oldX, oldY, sample);
}

export function eventPlayerSprites(player) {
  // shortcut: damage uses normal sprites; verify the original event-atlas overflow frames on Windows.
  if (player.state === 'scene36') return [
    { name: playerSprite(player), x: player.x, y: player.y - 69 },
    { name: '2#216.app', x: player.x, y: player.y - 9 },
  ];
  return [{ name: playerSprite(player), x: player.x, y: player.y - (player.state === 'scene20' || FLIGHT_POSES[player.state.slice(5)] ? 0 : 9) }];
}

export function stepEventNpc(npc, camera, sample, deferTerrain = false) {
  if (npc.removed || npc.born) return;
  if (npc.scene) {
    if (npc.scene.dynamicOld) { npc.oldX = npc.x; npc.oldY = npc.y; }
    const animation = npc.scene.states[npc.state];
    npc.vx = animation.vx - Math.sign(animation.vx);
    if (npc.vy <= 10) npc.vy++;
    npc.x += npc.vx; npc.y += npc.vy;
    if (++npc.ticks > npc.period) { npc.ticks = 0; npc.frame = (npc.frame + 1) % npc.count; }
    npc.spriteIndex = animation.frames[npc.frame];
    if (!deferTerrain) resolveEnemyTerrain(npc, sample);
    return;
  }
  if (Math.abs(npc.x - camera.x - 320) > 960 || npc.state === 2) npc.removed = true;
  const oldX = npc.x, oldY = npc.y;
  npc.oldX = oldX; npc.oldY = oldY;
  npc.vx -= Math.sign(npc.vx);
  if (npc.vy <= 10) npc.vy++;
  npc.x += npc.vx;
  npc.y += npc.vy;
  if (++npc.ticks > 10) {
    npc.ticks = 0;
    npc.frame = (npc.frame + 1) % (npc.index === 2 && npc.state === 0 ? 1 : 2);
  }
  if (!deferTerrain && bodyCollision(npc.x, npc.y, sample, npc.body) === 1) resolveTerrain(npc, oldX, oldY, sample, npc.body);
}

export function eventNpcSprite(npc) {
  if (npc.scene) return npc.scene.images[npc.spriteIndex];
  const offset = npc.state === 1 ? npc.index === 2 ? 1 : 2 : 0;
  return `1#2${npc.index + 1}${1 + offset + npc.frame}.app`;
}
