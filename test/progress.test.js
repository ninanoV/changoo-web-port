import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeUnlocks, loadUnlocks, saveUnlocks } from '../web/progress.js';
import * as progress from '../web/progress.js';

const seed = decodeUnlocks(readFileSync(new URL('../Changoo (E)/RESOURCE/game.dat', import.meta.url)));

test('fresh web installs start at stage one with all minigames locked', () => {
  assert.deepEqual(progress.FRESH_MINIGAME_UNLOCKS, [0, 0, 0, 0, 0]);
  assert.equal(progress.FRESH_STAGE_COUNT, 1);
  const storage = { getItem: () => null };
  assert.deepEqual(loadUnlocks(storage, progress.FRESH_MINIGAME_UNLOCKS), [0, 0, 0, 0, 0]);
  assert.equal(progress.loadStageProgress(storage, progress.FRESH_STAGE_COUNT), 1);
});

test('original game.dat contains exactly five little-endian unlock flags', () => {
  assert.deepEqual(seed, [1, 0, 1, 1, 0]);
  assert.throws(() => decodeUnlocks(new Uint8Array(19)));
  const invalid = new Uint8Array(20); invalid[0] = 2;
  assert.throws(() => decodeUnlocks(invalid));
});

test('browser unlock saves override the original without changing the seed', () => {
  const values = new Map(), storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const flags = loadUnlocks(storage, seed);
  flags[1] = 1;
  assert.deepEqual(seed, [1, 0, 1, 1, 0]);
  assert.equal(saveUnlocks(storage, flags), true);
  assert.deepEqual(loadUnlocks(storage, seed), [1, 1, 1, 1, 0]);
  assert.equal(values.size, 1);
});

test('invalid or blocked browser storage falls back safely and reports write failure', () => {
  for (const value of ['broken', '{}', 'null', '[1,0]', '[1,0,1,1,2]', '[true,0,1,1,0]']) {
    assert.deepEqual(loadUnlocks({ getItem: () => value }, seed), seed);
  }
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadUnlocks(blocked, seed), seed);
  assert.equal(saveUnlocks(blocked, seed), false);
  assert.equal(saveUnlocks(null, seed), false);
  assert.throws(() => saveUnlocks(blocked, [1]));
});

import { decodeStageProgress, loadStageProgress, enterSavedStage } from '../web/progress.js';
const stageRows = JSON.parse(readFileSync(new URL('./fixtures/original-stage-progress.json', import.meta.url)));

test('native stage entry saves the highest entered stage and never lowers an existing record', () => {
  for (const row of stageRows) {
    const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const seed = Math.min(7, row.saved ?? 1);
    const result = enterSavedStage(storage, seed, row.stage + 1);
    assert.equal(result.count, Math.min(7, row.result ?? 1), JSON.stringify(row));
    assert.equal(result.written, row.io.some(event => event.mode === 'wb'));
    assert.equal(loadStageProgress(storage, seed), result.count);
  }
});

test('stage save parser validates size and positive values, and preserves native upper clamping', () => {
  const bytes = readFileSync(new URL('../Changoo (E)/RESOURCE/save.dat', import.meta.url));
  assert.equal(decodeStageProgress(bytes), 5);
  for (const count of [1,7,9,2147483647]) {
    const input = new Uint8Array(4); new DataView(input.buffer).setInt32(0,count,true);
    assert.equal(decodeStageProgress(input),Math.min(7,count));
  }
  for (const input of [new Uint8Array(0),new Uint8Array(5),new Uint8Array(4),Uint8Array.of(255,255,255,255)]) assert.throws(()=>decodeStageProgress(input));
});

test('stage progress rejects corrupt storage and keeps this run playable on write failure', () => {
  for (const value of ['broken','{}','null','0','8','-1','1.5','"5"']) assert.equal(loadStageProgress({getItem:()=>value},5),5);
  const blocked = {getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  assert.equal(loadStageProgress(blocked,5),5);
  assert.deepEqual(enterSavedStage(blocked,5,6),{count:6,written:false,saved:false});
  assert.deepEqual(enterSavedStage(null,5,6),{count:6,written:false,saved:false});
  assert.throws(()=>enterSavedStage(blocked,5,8));
  assert.throws(()=>loadStageProgress(null,0));
});
