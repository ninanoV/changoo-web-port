import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, playerAnimation, enterNextStage, followCamera } from '../web/game.js';
import { createWorld, stepWorld, createActor, stepActor, createProjectile, stepProjectile, hitProjectile, resolveProjectileTerrain, readStageObjects } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { createEvent } from '../web/events.js';
import { setStage2State } from '../web/stage2-actors.js';
import { JUNGLE_SCENE, JUNGLE_POSES, JUNGLE_BOSS_BULLET } from '../web/jungle-boss-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-jungle-bosses.json', import.meta.url)));
const battle = JSON.parse(readFileSync(new URL('./fixtures/original-jungle-battle.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage4.map')), mask = decodeImage(archive.get('block4.app'));
const sample = (x, y) => collisionAt(map, mask, x, y), camera = {x: 24200, y: 5919};
const names = {0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash'};
function compare(actual, expected, label, player = false) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], player && key === 'state' ? names[value] ?? `scene${value}` : value, `${label}/${key}`);
}
test('the complete native paired-boss fight and real next-map transition agree at every tick', () => {
  const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
  const p = createPlayer(24520, 6232), world = createWorld(readStageObjects(map, config, archive), map);
  // capture-jungle-battle.py explicitly clears this marker's native birth flag before tick zero.
  world.triggers.find(trigger => trigger.kind === 86 && trigger.y === 6250).active = true;
  for (const [tick, row] of battle.trace.entries()) {
    assert.deepEqual(stepWorld(world, p, row.input, row.camera, sample, Math.floor(tick * 1000 / 30)), row.sounds, `fight/${tick}/sounds`);
    assert.equal(world.stageComplete, row.stage === 5);
    if (world.stageComplete) enterNextStage(p, 5);
    compare(p, row.player, `fight/${tick}/player`, true);
    assert.equal(world.pairedBossesRemaining, row.remaining, `fight/${tick}/remaining`);
    for (const actor of world.actors.filter((a) => a.kind === 39 || a.kind === 40)) compare(actor, row.bosses[actor.kind], `fight/${tick}/${actor.kind}`);
    const shots = world.stageComplete ? [] : world.projectiles;
    assert.equal(shots.length, row.shots.length, `fight/${tick}/shots`);
    for (const [index, shot] of shots.entries()) compare(shot, row.shots[index], `fight/${tick}/shot${index}`);
  }
  assert.equal(p.lives, 8); assert.equal(p.points, 20);
  assert.equal(p.balls + p.waterBombs + p.companionItems.reduce((sum, count) => sum + count, 0), 0);
  assert.deepEqual(battle.mapLoads, [{function: '0x43ef80', stage: 4}, {function: '0x43ee50', stage: 5}]);
  const nextMap = decodeMap(archive.get('stage5.map')), nextMask = decodeImage(archive.get('block5.app'));
  assert.equal(nextMap.width, 1407); assert.equal(nextMap.height, 100);
  const next = createWorld(readStageObjects(nextMap, config, archive), nextMap), view = {x: 0, y: 0};
  next.stageEntry = createStageEntry(6, 100000);
  for (let tick = 1; tick < 330; tick++) {
    stepWorld(next, p, {right: true}, view, (x, y) => collisionAt(nextMap, nextMask, x, y), 100000 + tick * 1000 / 30);
    if (next.stageEntry.finished) followCamera(view, p, nextMap);
  }
  assert.equal(next.stageEntry.finished, true); assert.equal(p.lives, 8); assert.equal(p.points, 21); assert.equal(p.chocobi, 1);
  assert.ok(next.actors.some((actor) => actor.kind === 10 && actor.x === 1485 && actor.collected));
  assert.ok(p.x > 500 && p.y > 500); assert.equal(p.dead, false);
});
test('paired jungle boss dialogue, actor atlases and bullet assets match native extraction', () => {
  assert.deepEqual(JUNGLE_SCENE, fixture.scene); assert.deepEqual(JUNGLE_POSES, fixture.poses); assert.deepEqual(JUNGLE_BOSS_BULLET, fixture.bullet);
  for (const pose of Object.values(JUNGLE_POSES)) for (const frame of pose.frames) decodeImage(archive.get(`${frame}.app`));
  for (const actor of Object.values(JUNGLE_SCENE.enemies)) for (const name of actor.images) decodeImage(archive.get(name));
  for (const name of JUNGLE_BOSS_BULLET.images) decodeImage(archive.get(name));
  for (const clip of [...JUNGLE_SCENE.startSounds, ...JUNGLE_SCENE.timeline.flatMap((row) => row[2])]) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${clip}`, import.meta.url)));
});
for (const {scenario, initial, trace} of fixture.sequences) {
  test(`paired boss dialogue/${scenario}: full native scheduler and combat handoff agree`, () => {
    const p = createPlayer(24520, 6232), world = createWorld([], map);
    if (scenario === 'hurt-entry') p.state = 'hurt';
    world.event = createEvent(86, p, camera, 1000); world.actors.push(...world.event.enemies);
    compare(p, initial.player, 'initial', true);
    for (const [tick, row] of trace.entries()) {
      assert.deepEqual(stepWorld(world, p, {enter: row.enter}, camera, sample, 1000 + row.elapsed), row.sounds, `${scenario}/${tick}/sounds`);
      compare(p, row.expected.player, `${scenario}/${tick}/player`, true);
      assert.equal(playerAnimation(p).count, row.expected.count); assert.equal(playerAnimation(p).period, row.expected.period);
      assert.equal(world.event === null, row.expected.removed);
      if (world.event) assert.equal(world.event.phase, row.expected.phase);
      for (const actor of world.actors) compare(actor, row.expected.bosses[actor.kind], `${scenario}/${tick}/${actor.kind}`);
    }
  });
}
test('ten native damage cycles per boss preserve delayed HP loss and final movement', () => {
  for (const {kind, strikes} of fixture.deaths) {
    const actor = createActor(kind, 24860, 6102), p = createPlayer(24520, 6232);
    actor.scripted = false;
    for (const [strike, trace] of strikes.entries()) {
      setStage2State(actor, 4);
      for (const [tick, expected] of trace.entries()) {
        stepActor(actor, p, () => 0, true, camera);
        compare(actor, expected, `${kind}/${strike}/${tick}`);
      }
    }
    assert.equal(actor.health, 0); assert.equal(actor.removed, true);
  }
});
test('straight boss projectile preserves animation, speed, camera expiry and terrain removal', () => {
  for (const {initial, trace} of fixture.bulletTraces) {
    const shot = Object.assign(createProjectile({type: 68, ...initial}), initial);
    for (const [tick, expected] of trace.entries()) { stepProjectile(shot, () => 0, true, camera); compare(shot, expected, `${initial.vx}/${tick}`); }
  }
  for (const {pixel, initial, expected} of fixture.bulletTerrain) {
    const shot = Object.assign(createProjectile({type: 68, ...initial}), initial);
    resolveProjectileTerrain(shot, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(shot, expected, `${pixel}/${initial.x}/${initial.y}`);
  }
});
test('boss projectile immunity, knockback and consumption match native contacts', () => {
  for (const {before, vx, player, removed, sounds} of fixture.bulletContacts) {
    const p = Object.assign(createPlayer(before.x, before.y), before, {state: names[before.state]});
    const shot = createProjectile({type: 68, x: 24860, y: 6132, vx, vy: 0});
    assert.deepEqual(hitProjectile(p, shot), sounds);
    assert.equal(shot.removed, removed); compare(p, player, `${before.state}/${vx}`, true);
  }
});
