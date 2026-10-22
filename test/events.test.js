import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, playerSprite, followCamera, stepPlayer } from '../web/game.js';
import { createWorld, stepWorld, readStageObjects, createActor, stepActor, actorSprite } from '../web/objects.js';
import { createEvent, advanceEvent, finishEvent, stepEventPlayer, stepEventNpc, eventNpcSprite } from '../web/events.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-event65.json', import.meta.url)));
const encounterFixture = JSON.parse(readFileSync(new URL('./fixtures/original-event117.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const camera = { x: 4000, y: 2400 };
function snapshot(event, player, sounds) {
  return { phase: event.phase, playerState: player.state === 'idle' ? 0 : Number(player.state.slice(5)),
    npcStates: event.npcs.map((npc) => npc.state), removed: event.removed, sounds };
}

test('event 65 matches all 18 native timer boundaries and audio cues', () => {
  const p = createPlayer(4223, 2680), event = createEvent(65, p, camera, 1000);
  assert.deepEqual(snapshot(event, p, ['29.WAV', '30.WAV']), fixture.initial);
  for (const { elapsed, expected } of fixture.boundaries) {
    assert.deepEqual(snapshot(event, p, advanceEvent(event, p, false, 1000 + elapsed)), expected);
  }
});

test('Enter skips on release, elapsed time can cross multiple phases, and repeated updates stay silent', () => {
  const p = createPlayer(4223, 2680), event = createEvent(65, p, camera, 0);
  for (const { enter, expected } of fixture.skip) {
    assert.deepEqual(snapshot(event, p, advanceEvent(event, p, enter, 0)), expected);
  }
  assert.deepEqual(advanceEvent(event, p, false, 100000), []);
  const other = createEvent(65, p, camera, 0);
  assert.deepEqual(advanceEvent(other, p, false, 40000), fixture.boundaries.flatMap(({ expected }) => expected.sounds));
  assert.equal(other.removed, true);
});

test('event cleanup restores the old state with the native idle animation', () => {
  const states = { 0: 'idle', 1: 'walk', 2: 'air', 7: 'chickenIdle', 12: 'roachIdle' };
  for (const expected of fixture.restored) {
    const p = createPlayer(4223, 2680);
    p.state = states[expected.savedState];
    const event = createEvent(65, p, camera, 0);
    advanceEvent(event, p, false, 40000);
    finishEvent(event, p);
    assert.equal(p.state, states[expected.state]);
    assert.equal(p.frame, expected.frame);
    assert.equal(p.ticks, expected.ticks);
    assert.equal(p.animationOverride.period, expected.period);
    assert.equal(playerSprite(p), 'stop0.app');
    stepPlayer(p, {}, sample);
    assert.ok(archive.has(playerSprite(p)));
  }
});

test('all six player poses match 300 native physics ticks and sprite selections', () => {
  for (const { state, trace } of fixture.poses) {
    const p = createPlayer(4223, 2680);
    p.state = `scene${state}`;
    trace.forEach((expected, tick) => {
      stepEventPlayer(p, sample);
      for (const [key, value] of Object.entries(expected)) {
        const actual = key === 'sprite' ? playerSprite(p) : key === 'state' ? Number(p.state.slice(5)) : p[key];
        assert.equal(actual, value, `state ${state}, tick ${tick}, ${key}`);
        if (key === 'sprite') assert.ok(archive.has(actual));
      }
    });
  }
});

test('three NPCs match 480 native gravity, terrain and animation ticks', () => {
  for (const { index, state, trace } of fixture.npcs) {
    const npc = createEvent(65, createPlayer(4223, 2680), camera, 0).npcs[index];
    npc.state = state;
    trace.forEach((expected, tick) => {
      stepEventNpc(npc, camera, sample);
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(key === 'sprite' ? eventNpcSprite(npc) : npc[key], value, `npc ${index}, state ${state}, tick ${tick}, ${key}`);
        if (key === 'sprite') assert.ok(archive.has(value));
      }
    });
  }
});

test('the world finishes the dialogue naturally and keeps NPCs until they leave the active area', () => {
  const world = createWorld([{ kind: 65, column: 131, row: 84, x: 4223, y: 2680 }]);
  world.triggers[0].active = true; // This scenario starts beside an already instantiated trigger.
  const p = createPlayer(4200, 2680);
  assert.deepEqual(stepWorld(world, p, {}, camera, sample, 0), ['29.WAV', '30.WAV']);
  for (let tick = 1; tick <= 1190; tick++) stepWorld(world, p, { right: true }, camera, sample, tick * 1000 / 30);
  assert.equal(world.event, null);
  assert.equal(p.lives, 5);
  assert.equal(p.x, 4317, 'native controller stops walking before the first tick past 3930 ms');
  assert.ok(world.npcs.every((npc) => !npc.removed && npc.state === 0));
  for (let tick = 0; tick < 3; tick++) stepWorld(world, p, { right: true }, { x: 6000, y: 2400 }, sample, 40000);
  assert.equal(p.state, 'walk');
  assert.equal(p.vx, 7);
  assert.ok(world.npcs.every((npc) => npc.removed));
});

test('the home route triggers the dialogue once, ignores movement input, skips and resumes walking', () => {
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(objects), p = createPlayer(0, 3032), view = { x: 0, y: 2719 };
  let time = 0;
  function run(ticks, input) {
    for (let i = 0; i < ticks; i++) {
      const controls = world.event?.kind === 118 ? { ...input, enter: !world.event.enterHeld } : input;
      stepWorld(world, p, controls, view, sample, time += 1000 / 30);
      followCamera(view, p, map);
    }
  }
  run(250, { right: true });
  for (let i = 0; i < 7; i++) { run(35, { right: true, jump: true }); run(10, { right: true }); }
  run(200, { right: true });
  run(50, { jump: true });
  run(110, { right: true });
  assert.equal(world.playedEvents.has(65), true);
  assert.equal(p.state, 'scene20');
  assert.equal(world.npcs.length, 3);
  const x = p.x;
  run(10, { left: true, jump: true, fire: true });
  assert.equal(p.x, x + 10, 'scripted walk continues regardless of keyboard input');
  run(1, { enter: true });
  assert.ok(world.event);
  run(1, {});
  assert.equal(world.event, null);
  run(30, { right: true });
  assert.equal(p.state, 'walk');
  assert.equal(p.vx, 7);
  assert.equal(world.event, null);
  assert.equal(p.lives, 5);
});

test('event 117 matches native boundaries, audio cues, skipping and enemy callback restoration', () => {
  function setup() {
    const p = createPlayer(5520, 2680), enemy = createActor(0, 5920, 2650);
    return { p, event: createEvent(117, p, { x: 5320, y: 2400 }, 1000, enemy) };
  }
  function view(event, p, sounds) {
    return { phase: event.phase, playerState: p.state === 'idle' ? 0 : Number(p.state.slice(5)),
      enemyState: event.enemy.state, enemyUpdate: event.enemy.scripted ? '0x403f70' : '0x4039e0', removed: event.removed, sounds };
  }
  const { p, event } = setup();
  assert.deepEqual(view(event, p, ['43.WAV']), encounterFixture.initial);
  for (const { elapsed, expected } of encounterFixture.boundaries) {
    assert.deepEqual(view(event, p, advanceEvent(event, p, false, elapsed + 1000)), expected);
  }
  const skipped = setup();
  for (const { enter, expected } of encounterFixture.skip) {
    assert.deepEqual(view(skipped.event, skipped.p, advanceEvent(skipped.event, skipped.p, enter, 1000)), expected);
  }
  for (const { savedState, expected, period } of encounterFixture.restored) {
    const { p, event } = setup();
    const names = { 0: 'idle', 1: 'walk', 2: 'air', 7: 'chickenIdle', 12: 'roachIdle' };
    event.previousState = names[savedState];
    advanceEvent(event, p, false, 13161);
    finishEvent(event, p);
    for (const [key, value] of Object.entries(expected)) assert.equal(p[key], key === 'state' ? names[value] : value);
    assert.equal(p.animationOverride.period, period);
  }
});

test('the second dialogue player poses match all 250 native ticks and images', () => {
  for (const { state, trace } of encounterFixture.poses) {
    const p = createPlayer(5520, 2680);
    p.state = `scene${state}`;
    trace.forEach((expected, tick) => {
      stepEventPlayer(p, sample);
      for (const [key, value] of Object.entries(expected)) {
        const actual = key === 'sprite' ? playerSprite(p) : key === 'state' ? Number(p.state.slice(5)) : p[key];
        assert.equal(actual, value, `state ${state}, tick ${tick}, ${key}`);
        if (key === 'sprite') assert.ok(archive.has(actual));
      }
    });
  }
});

test('the scripted enemy matches 160 native ticks and returns to the same live actor', () => {
  for (const { state, trace, resumed } of encounterFixture.enemies) {
    const p = createPlayer(5520, 2680), enemy = createActor(0, 5920, 2650);
    const event = createEvent(117, p, { x: 5320, y: 2400 }, 0, enemy);
    enemy.state = state;
    trace.forEach((expected, tick) => {
      stepActor(enemy, p, sample);
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(key === 'sprite' ? actorSprite(enemy) : enemy[key], value, `state ${state}, tick ${tick}, ${key}`);
        if (key === 'sprite') assert.ok(archive.has(value));
      }
    });
    advanceEvent(event, p, false, 12161);
    for (const [key, value] of Object.entries(resumed)) assert.equal(enemy[key], value, key);
    assert.equal(enemy.scripted, false);
    assert.equal(actorSprite(enemy), 'c1.app');
  }
});

test('the home route reaches both dialogues and the second dialogue leaves a stompable enemy', () => {
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(objects), p = createPlayer(0, 3032), view = { x: 0, y: 2719 };
  let time = 0;
  function run(ticks, input) {
    for (let i = 0; i < ticks; i++) {
      const controls = world.event?.kind === 118 ? { ...input, enter: !world.event.enterHeld } : input;
      stepWorld(world, p, controls, view, sample, time += 1000 / 30);
      followCamera(view, p, map);
    }
  }
  run(250, { right: true });
  for (let i = 0; i < 7; i++) { run(35, { right: true, jump: true }); run(10, { right: true }); }
  run(200, { right: true });
  run(50, { jump: true });
  run(110, { right: true });
  run(1, { enter: true });
  run(1, {});
  for (let i = 0; i < 300 && world.event?.kind !== 117; i++) run(1, { right: true });
  assert.equal(world.event?.kind, 117);
  assert.equal(p.state, 'scene107');
  const enemy = world.event.enemy, oldX = p.x;
  run(365, { right: true, jump: true, fire: true });
  assert.equal(world.event, null);
  assert.equal(p.x, oldX);
  assert.equal(enemy.scripted, false);
  assert.equal(enemy.state, 0);
  run(Math.floor((enemy.x - p.x - 105) / 7), { right: true });
  const score = p.points;
  run(12, { right: true, jump: true });
  run(25, {});
  assert.equal(enemy.state, 3);
  assert.equal(p.points, score + 1);
  assert.equal(p.lives, 5);
  assert.deepEqual([...world.playedEvents], [118, 65, 117]);
});
