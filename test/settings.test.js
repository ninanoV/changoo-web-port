import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSettings, stepSettings } from '../web/settings.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-settings.json', import.meta.url)));
for (const trace of fixture.traces) test(`native ${trace.kind} settings: ${trace.name}`, () => {
  const menu = createSettings(trace.kind, { factor: 1, delay: 16, scroll: 1, saveSpeed: 0, boost: 1 });
  const values = expected => Object.fromEntries(Object.keys(expected).map(key => [key, menu[key]]));
  assert.deepEqual(values(trace.initial),trace.initial);
  for (const [i,row] of trace.trace.entries()) {
    const effects = stepSettings(menu,row.input,trace.elapsed);
    assert.deepEqual(values(row.state),row.state,`state ${i}`);
    assert.deepEqual(menu.render,row.draws,`draw ${i}`);
    assert.deepEqual(effects,{sounds:row.sounds,cd:row.cd,requests:row.requests},`effects ${i}`);
  }
});
