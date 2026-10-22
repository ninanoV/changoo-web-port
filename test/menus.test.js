import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMainMenu, createSelection, stepMenu } from '../web/menus.js';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/original-menus.json', import.meta.url)));
for (const [kind, traces] of Object.entries(fixtures)) for (const trace of traces) {
  test(`native ${kind} menu: ${trace.name}`, () => {
    const menu = kind === 'main' ? createMainMenu(1000) : createSelection(trace.missing ? 1 : trace.stageCount, trace.missing ? [0,0,0,0,0] : trace.flags);
    // This clock global predates construction and is overwritten on the first update.
    if (kind === 'select') menu.musicAt = trace.initial.musicAt;
    const values = expected => Object.fromEntries(Object.keys(expected).map(key => [key, menu[key]]));
    assert.deepEqual(values(trace.initial), trace.initial);
    for (const [i, row] of trace.trace.entries()) {
      const effects = stepMenu(menu, row.input, row.now);
      assert.deepEqual(values(row.expected), row.expected, `state tick ${i}`);
      assert.deepEqual(menu.render, row.draws, `draw tick ${i}`);
      assert.deepEqual(effects, { sounds: row.sounds, cd: row.cd, requests: row.requests }, `effects tick ${i}`);
    }
  });
}
