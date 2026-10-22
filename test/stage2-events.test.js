import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, playerAnimation, stepPlayer, followCamera } from '../web/game.js';
import { createEvent, advanceEvent, stepEventPlayer, eventPlayerSprites } from '../web/events.js';
import { createWorld, stepWorld, createActor, hitActor, readStageObjects } from '../web/objects.js';
import { STAGE2_EVENTS, STAGE2_POSES } from '../web/stage2-event-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-stage2-events.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage2.map')), mask = decodeImage(archive.get('block2.app'));
const sample = (x, y) => collisionAt(map, mask, x, y), camera = { x: 6300, y: 1050 };
const stateName = (state) => state === 0 ? 'idle' : state === 1 ? 'walk' : state === 2 ? 'air' : state === 4 ? 'hurt' : state === 5 ? 'land' : `scene${state}`;
function compare(p, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(p[key], key === 'state' ? stateName(value) : value, `${label} ${key}`);
}

test('normal-map dialogue tables, poses and all referenced assets match the native extraction', () => {
  assert.deepEqual(STAGE2_EVENTS, fixture.metadata);
  assert.deepEqual(STAGE2_POSES, fixture.animations);
  for (const pose of Object.values(STAGE2_POSES)) for (const name of pose.frames) decodeImage(archive.get(`${name}.app`));
  for (const data of Object.values(STAGE2_EVENTS)) {
    for (const name of [...data.startSounds, ...data.timeline.flatMap((step) => step[2])]) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${name}`, import.meta.url)), name);
  }
});

for (const kind of Object.keys(STAGE2_EVENTS).map(Number)) {
  test(`dialogue ${kind}: exact timer boundaries, phases and voices agree`, () => {
    const p = createPlayer(6500, 1336), event = createEvent(kind, p, camera, 1000);
    for (const { elapsed, expected, sounds } of fixture.boundaries.filter((row) => row.kind === kind)) {
      assert.deepEqual(advanceEvent(event, p, false, 1000 + elapsed), sounds);
      assert.equal(event.phase, expected.phase);
      assert.equal(event.removed, expected.removed);
      compare(p, expected.player, `${kind} elapsed ${elapsed}`);
      assert.equal(playerAnimation(p).period, expected.period);
    }
  });
}

test('native pose ticks and draw commands preserve slow animation and the two-layer thought bubble', () => {
  for (const { state, trace } of fixture.poses) {
    const before = trace[0].before;
    const p = Object.assign(createPlayer(before.x, before.y), before, { state: stateName(state), animationOverride: STAGE2_POSES[state] });
    trace.forEach(({ expected, draws }, tick) => {
      assert.deepEqual(eventPlayerSprites(p).map(({ name, x, y }) => ({ name, x: x - camera.x, y: y - camera.y })), draws, `state ${state} tick ${tick} draw`);
      stepEventPlayer(p, sample);
      compare(p, expected, `state ${state} tick ${tick}`);
    });
  }
});

for (const { kind, scenario, trace, postExit } of fixture.sequences) {
  test(`dialogue ${kind}/${scenario}: controller, player, terrain and cleanup stay in native order`, () => {
    const p = createPlayer(6500, 1336), world = createWorld([]);
    if (scenario === 'hurt-entry') hitActor(p, createActor(0, 6510, 1336));
    world.event = createEvent(kind, p, camera, 1000);
    trace.forEach(({ elapsed, enter, contact, expected, sounds }, tick) => {
      const clips = stepWorld(world, p, { enter }, camera, sample, 1000 + elapsed);
      if (contact) clips.push(...hitActor(p, createActor(0, contact.x, contact.y)));
      assert.deepEqual(clips, sounds.map((name) => name === 'existing-effect' ? 'DEM-SHIN.WAV' : name), `${kind}/${scenario} tick ${tick} sound`);
      compare(p, expected.player, `${kind}/${scenario} tick ${tick}`);
      assert.equal(playerAnimation(p).period, expected.period);
      assert.equal(playerAnimation(p).count, expected.count);
      assert.equal(world.event === null, expected.removed);
      if (world.event) assert.equal(world.event.phase, expected.phase);
    });
    for (const [tick, expected] of postExit.entries()) {
      stepWorld(world, p, { right: true }, camera, sample, 20000 + tick * 1000 / 30);
      compare(p, expected.player, `${kind}/hurt-entry after exit ${tick}`);
      assert.equal(playerAnimation(p).count, expected.count);
      assert.equal(playerAnimation(p).period, expected.period);
    }
  });
}

test('the real stage-two dialogue trigger starts once and returns to walking after natural completion', () => {
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const trigger = objects.filter((o) => o.kind === 71).sort((a, b) => b.x - a.x)[0];
  const p = createPlayer(trigger.x - 65, trigger.y - 100), world = createWorld(objects), view = { x: p.x - 132, y: 0 };
  for (let i = 0; i < 500; i++) stepPlayer(p, {}, sample);
  for (let i = 0; i < 300; i++) followCamera(view, p, map);
  let now = 1000;
  for (let tick = 0; tick < 40 && !world.event; tick++) {
    stepWorld(world, p, { right: true }, view, sample, now += 1000 / 30);
    followCamera(view, p, map);
  }
  assert.equal(world.event?.kind, 71);
  for (let tick = 0; tick < 400 && world.event; tick++) stepWorld(world, p, {}, view, sample, now += 1000 / 30);
  assert.equal(world.event, null);
  const x = p.x;
  for (let tick = 0; tick < 10; tick++) stepWorld(world, p, { right: true }, view, sample, now += 1000 / 30);
  assert.ok(p.x > x);
  assert.equal(world.event, null);
  assert.equal(p.lives, 5);
});

test('all five stage5 dialogue markers trigger on the real map and finish without replay', () => {
  const stageMap = decodeMap(archive.get('stage5.map')), stageMask = decodeImage(archive.get('block5.app'));
  const sampleStage = (x, y) => collisionAt(stageMap, stageMask, x, y);
  const defs = readStageObjects(stageMap, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  for (const kind of [107, 108, 109, 110, 111]) {
    const trigger = defs.find(d => d.kind === kind), p = createPlayer(trigger.x - 65, trigger.y - 150);
    const world = createWorld(defs, stageMap), view = {x: p.x - 200, y: Math.max(0, p.y - 250)}; let now = 1000;
    for (let i = 0; i < 90 && !world.event; i++) {
      stepWorld(world, p, {right: true}, view, sampleStage, now += 1000 / 30);
      followCamera(view, p, stageMap);
    }
    assert.equal(world.event?.kind, kind);
    for (let i = 0; i < 650 && world.event; i++) {
      stepWorld(world, p, {}, view, sampleStage, now += 1000 / 30);
      assert.equal(p.hazard, false, `${kind} tick ${i}`);
    }
    assert.equal(world.event, null); assert.equal(world.playedEvents.has(kind), true);
    assert.equal(p.dead, false);
    const x = p.x;
    for (let i = 0; i < 10; i++) stepWorld(world, p, {right: true}, view, sampleStage, now += 1000 / 30);
    assert.ok(p.x > x); assert.equal(world.event, null);
  }
});
