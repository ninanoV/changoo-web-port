import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../web/game.js';
import { createActor, hitActor, stepActor, actorSprite } from '../web/objects.js';
import { JUNGLE_ITEMS } from '../web/jungle-item-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-jungle-items.json', import.meta.url)));
const states = {0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash'};
test('jungle pickups preserve native counters, score bonuses and duplicate-contact guard', () => {
  assert.deepEqual(JUNGLE_ITEMS, fixture.metadata);
  for (const {kind, initial, snapshots} of fixture.contacts) {
    const p = Object.assign(createPlayer(6500, 1200), initial, {state: states[initial.state], jungleItems: [...initial.jungleItems]});
    const actor = createActor(kind, 6500, 1200), data = JUNGLE_ITEMS[kind];
    assert.equal(actorSprite(actor), data.name);
    assert.equal(actor.width, data.width); assert.equal(actor.height, data.height);
    assert.deepEqual(Object.values(actor.body), data.body);
    for (const expected of snapshots) {
      assert.deepEqual(hitActor(p, actor), expected.sounds);
      for (const [key, value] of Object.entries(expected.player)) assert.deepEqual(p[key], key === 'state' ? states[value] : value, `${kind} ${key}`);
      for (const [key, value] of Object.entries(expected.actor)) assert.equal(actor[key], value, `${kind} ${key}`);
    }
  }
});
test('jungle pickup popups follow the native HUD arc and removal threshold', () => {
  for (const {kind, initial, trace} of fixture.popups) {
    const actor = Object.assign(createActor(kind, 6500, 1200), initial);
    for (const expected of trace) {
      stepActor(actor, createPlayer(0, 0), () => 0);
      for (const [key, value] of Object.entries(expected)) assert.equal(actor[key], value, `${kind} ${key}`);
    }
  }
});
