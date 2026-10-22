import { SETTINGS } from './settings-data.js';

export const calibrationFactor = elapsed => elapsed < 500 ? 1 : elapsed < 1200 ? 2 : 3;

export function createSettings(kind, preferences) {
  if (!SETTINGS[kind]) throw new Error(`Unknown settings menu: ${kind}`);
  return { kind, ...preferences, selection: kind === 'slider' ? 209 - preferences.delay : 0,
    enterHeld: 0, removed: false, render: [] };
}

export function stepSettings(menu, input, measuredElapsed = 0) {
  const effects = { sounds: [], cd: [], requests: [] };
  menu.render = [];
  if (menu.removed) return effects;
  const assets = SETTINGS[menu.kind];
  const draw = (name, x, y) => menu.render.push({ name, x, y });
  const go = target => { menu.removed = true; effects.requests.push({ target, stage: 0 }); };
  draw(assets.background, 0, 0);
  if (menu.kind === 'slider') {
    draw(assets.labels[0], 60, 200); draw(assets.labels[1], 460, 200); draw(assets.bar, 100, 260);
    for (let i = 0; i < menu.selection * 2; i++) draw(assets.fill, 100 + i, 260);
    if (input.left && menu.selection > 0) menu.selection--;
    if (input.right && menu.selection < 209) menu.selection++;
  } else if (menu.kind === 'scroll') {
    draw(assets.choices[menu.selection], menu.selection ? 463 : 310, menu.selection ? 160 : 163);
    if (input.left) menu.selection = 0;
    if (input.right) menu.selection = 1;
  } else {
    draw(assets.choices[menu.selection], 180, 200);
    if (input.up) menu.selection = 0;
    if (input.down) menu.selection = 1;
  }
  if (input.enter) menu.enterHeld = 1;
  else if (menu.enterHeld) {
    if (menu.kind !== 'scroll') menu.enterHeld = 0;
    if (menu.kind === 'options') {
      effects.cd.push('stop cdaudio'); go(menu.selection ? 'scroll' : 'speed'); return effects;
    }
    if (menu.kind === 'speed' && menu.selection) {
      effects.cd.push('stop cdaudio'); go('slider'); return effects;
    }
    if (menu.kind === 'scroll') menu.scroll = menu.selection;
    else {
      // The benchmark presents this background ten times before committing the setting.
      for (let i = 0; i < 10; i++) draw(assets.background, 0, 0);
      menu.factor = calibrationFactor(measuredElapsed);
      if (menu.kind === 'slider') { menu.delay = 209 - menu.selection; menu.boost = 0; }
      else menu.delay = menu.factor * 16;
      menu.saveSpeed = 1;
      effects.sounds.push({ name: assets.confirm, loop: false });
    }
    go('main');
    if (menu.kind === 'slider') return effects;
  }
  if (input.back) go(menu.kind === 'speed' ? 'options' : 'main');
  return effects;
}
