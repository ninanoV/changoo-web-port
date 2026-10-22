import { MENU } from './menu-data.js';

export function createMainMenu(now = 0) {
  return { kind: 'main', selection: 0, actorY: 0, titleY: 300, buttonsX: 0, ticks: 0,
    upHeld: 0, downHeld: 0, enterHeld: 0, frameCount: 3, frame: 0, frameTicks: 0,
    startedAt: now, now: 0, phase: 0, animation: 0, musicAt: now, removed: false, quit: false, render: [] };
}

// Selection globals survive a minigame and a later visit to the original menu.
export function createSelection(stageCount, flags, previous) {
  return { kind: 'select', stage: previous?.stage ?? 0, mini: previous?.mini ?? 0,
    stageMode: previous?.stageMode ?? 1, frame: previous?.frame ?? 0, stageCount: Math.min(7, stageCount), flags: [...flags],
    leftReady: previous?.leftReady ?? 0, rightReady: previous?.rightReady ?? 0,
    upReady: previous?.upReady ?? 0, downReady: previous?.downReady ?? 0, spaceReady: previous?.spaceReady ?? 0,
    musicPlaying: 0, musicAt: previous?.musicAt ?? 0, removed: false, quit: false, render: [] };
}

const draw = (menu, name, x, y) => menu.render.push({ name, x, y });
const request = (effects, target, stage = 0) => effects.requests.push({ target, stage });

function stepMain(menu, input, now, effects) {
  const assets = MENU.main;
  if (!menu.ticks) { effects.cd.push('play cdaudio from 2 to 3'); menu.musicAt = now; }
  menu.now = now;
  if (menu.phase < 20 && now - menu.startedAt > (menu.phase + 1) * 10000) {
    menu.phase++;
    menu.animation = Math.min(4, menu.phase);
    menu.frame = 0;
    menu.frameCount = 2;
    if (menu.phase >= 4) effects.sounds.push(...assets.sounds.map(name => ({ name, loop: false })));
  }
  if (now - menu.musicAt > 165000) { effects.cd.push('play cdaudio from 2 to 3'); menu.musicAt = now; }
  draw(menu, assets.background, 0, 0);
  draw(menu, assets.actor[assets.animations[menu.animation][menu.frame]], 50, menu.actorY);
  draw(menu, assets.title, 50, menu.titleY);
  for (let i = 0; i < 3; i++) {
    const selected = menu.selection === i;
    draw(menu, assets.buttons[i * 2 + Number(selected)], menu.buttonsX - (i === 1 ? 2 : 0), 180 + i * 40 - (i === 1 && !selected ? 4 : 0));
  }
  menu.actorY += Math.trunc((160 - menu.actorY) / 2);
  menu.titleY += Math.trunc((20 - menu.titleY) / 2);
  menu.buttonsX += Math.trunc((460 - menu.buttonsX) / 2);
  if (input.up && !menu.upHeld) menu.selection = Math.max(0, menu.selection - 1);
  if (input.down && !menu.downHeld) menu.selection = Math.min(2, menu.selection + 1);
  menu.upHeld = Number(Boolean(input.up)); menu.downHeld = Number(Boolean(input.down));
  if (input.enter) menu.enterHeld = 1;
  else if (menu.enterHeld) {
    menu.enterHeld = 0; menu.removed = true; effects.cd.push('stop cdaudio');
    if (menu.selection === 2) menu.quit = true;
    else request(effects, menu.selection === 0 ? 'select' : 'options');
    return;
  }
  if (++menu.frameTicks === 12) { menu.frameTicks = 0; if (++menu.frame === menu.frameCount) menu.frame = 0; }
  menu.ticks++;
}

function stepSelect(menu, input, now, effects) {
  const assets = MENU.select;
  if (!menu.musicPlaying) {
    menu.musicPlaying = 1; menu.musicAt = now;
    effects.sounds.push({ name: assets.music, loop: true }); effects.cd.push('play cdaudio from 3 to 4');
  }
  if (now - menu.musicAt > 26000) menu.musicPlaying = 0;
  if (input.back) { menu.removed = true; request(effects, 'main'); return; }
  if (menu.frame > 2) menu.frame = 0;
  if (input.draw !== false) {
    draw(menu, assets.background, 0, 0); draw(menu, assets.actor[menu.frame++], 154, 117);
    for (let i = 0; i < menu.stageCount; i++) draw(menu, assets.stages[i], ...assets.stagePositions[i]);
    for (let i = 0; i < 5; i++) if (menu.flags[i]) draw(menu, assets.minis[i], ...assets.miniPositions[i]);
    if (menu.stageMode) {
      draw(menu, assets.stageSelected[menu.stage], ...assets.selectedPositions[menu.stage]);
      draw(menu, assets.stageLabels[menu.stage], ...assets.labelPositions[menu.stage]);
    } else draw(menu, assets.miniSelected[menu.mini], ...assets.miniSelectedPositions[menu.mini]);
  }
  const moveSound = () => effects.sounds.push({ name: assets.moveSound, loop: false });
  for (const key of ['left', 'right', 'up', 'down', 'space']) {
    if (input[key] && menu[`${key}Ready`]) {
      if (key === 'space') {
        const first = menu.flags.findIndex(Boolean);
        if (first >= 0) { menu.mini = first; menu.stageMode = 1 - menu.stageMode; }
      } else if (menu.stageMode) {
        if (key === 'left' && menu.stage > 0) { menu.stage--; moveSound(); }
        if (key === 'right') {
          menu.stage++;
          if (menu.stage >= menu.stageCount) menu.stage = menu.stageCount - 1;
          else moveSound();
        }
        if (key === 'up' && menu.stage >= 4) { menu.stage -= 4; moveSound(); }
        if (key === 'down') {
          if (menu.stage + 4 < menu.stageCount) { menu.stage += 4; moveSound(); }
          else if (menu.stageCount > 3) menu.stage = menu.stageCount - 1;
        }
      } else if (key === 'up' || key === 'down') {
        const delta = key === 'up' ? -1 : 1;
        let next = menu.mini + delta;
        while (next >= 0 && next < 5 && !menu.flags[next]) next += delta;
        if (next >= 0 && next < 5) { menu.mini = next; moveSound(); }
      }
    }
    menu[`${key}Ready`] = Number(!input[key]);
  }
  if (input.enter) {
    if (menu.stageMode) { effects.cd.push('stop cdaudio'); menu.removed = true; request(effects, 'stage', menu.stage); }
    else if (menu.flags[menu.mini] === 1) { effects.cd.push('stop cdaudio'); request(effects, ['car', 'card', 'flag', 'mole', 'puzzle'][menu.mini]); }
  }
}

export function stepMenu(menu, input, now) {
  const effects = { sounds: [], cd: [], requests: [] };
  menu.render = [];
  if (menu.removed) return effects;
  if (menu.kind === 'main') stepMain(menu, input, now, effects);
  else stepSelect(menu, input, now, effects);
  return effects;
}
