// SHIN.EXE 0x405b80: rectangle relative to the 76 × 72 sprite, inclusive edges.
export const BODY = { left: 24, top: 14, right: 50, bottom: 71 };
const frames = {
  idle: ['stop0'], walk: ['walk0', 'walk1', 'walk2', 'walk3'], air: ['jump0', 'jump1'], land: ['jump2'], hurt: ['damage0', 'damage1'],
  idleLook: ['stop1', 'stop2'], bored: ['bore0', 'bore1'],
  chickenIdle: ['chi0'], chickenWalk: ['cw0', 'cw1', 'cw2', 'cw3'], chickenAir: ['chi_f1', 'chi_f2'], chickenLand: ['chi_f3'],
  roachIdle: ['roa0'], roachWalk: ['roa-w0', 'roa-w1', 'roa-w2', 'roa-w3'], roachAir: ['roa_f1', 'roa_f2'], roachLand: ['roa_f3'],
  roachBlink: ['roa1'], roachDash: ['roa-w0', 'roa-w1', 'roa-w2', 'roa-w3'], roachRecover: ['huk1', 'huk2'],
  scene20: ['walk0', 'walk1', 'walk2', 'walk3'], scene21: ['1#241'], scene22: ['1#242'],
  scene23: ['1#243', '1#244'], scene24: ['1#245', '1#246'], scene25: ['1#247', '1#248'],
  scene107: ['1#241'], scene108: ['1#242'], scene109: ['1#247', '1#248'],
  scene110: ['1#311', '1#312'], scene111: ['1#321', '1#322'],
};
const period = (state) => state === 'idle' || state === 'roachIdle' ? 100 : state === 'air' || state === 'roachAir' || state.startsWith('scene') ? 10 : 5;
export const isAirState = (state) => ['air', 'chickenAir', 'roachAir'].includes(state);
export const playerAnimation = (p) => p.animationOverride ?? { frames: frames[p.state], count: frames[p.state].length, period: period(p.state) };
const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

export function createPlayer(x, y) {
  return { x, y, oldX: x, oldY: y, screenX: 0, screenY: 0, vx: 0, vy: 0, facing: 1, state: 'idle', frame: 0, ticks: 0, jumpHeld: false, hazard: false,
    body: BODY, width: 76, height: 72, points: 0, chocobi: 0, cans: 0, lives: 5, invulnerable: 0, dead: false, onPlatform: false,
    flapHeld: false, flightTicks: 0, dashTicks: 0, recoverTicks: 0, fireHeld: false,
    balls: 0, waterBombs: 0, jungleItems: [0, 0], bananas: 0, companionItems: Array(6).fill(0), selectedItem: 0, menuHeld: false, openInventory: false, moveEnabled: true };
}

export function enterNextStage(player, fromStage = 1) {
  player.lives += 3;
  player.x = player.y = player.oldX = player.oldY = 0;
  if (fromStage === 1) player.moveEnabled = false;
  if (fromStage === 4) {
    setState(player, 'idle');
    player.flight = player.booster = false;
  }
  player.hazard = player.dead = false;
}

export function overlaps(a, b) {
  return a.x + a.body.left < b.x + b.body.right && a.x + a.body.right > b.x + b.body.left
    && a.y + a.body.top < b.y + b.body.bottom && a.y + a.body.bottom > b.y + b.body.top;
}

export function collisionAt(map, mask, x, y) {
  if (x < 0 || y < 0 || x >= map.width * 32 || y >= map.height * 32) return 0;
  const tile = map.cells[(Math.floor(y / 32) * map.width + Math.floor(x / 32)) * 5 + 1];
  if (tile < 0) return 0;
  const px = (tile % 20) * 32 + (x % 32);
  const py = Math.floor(tile / 20) * 32 + (y % 32);
  return mask.pixels[py * mask.width + px] ?? 0;
}

// 0x431130 samples the perimeter at 8-pixel intervals; the bottom/right corners are explicit.
export function bodyCollision(x, y, sample, body = BODY) {
  const left = x + body.left, right = x + body.right;
  const top = y + body.top, bottom = y + body.bottom;
  for (const type of [1, 2]) {
    for (let px = left; px < right; px += 8) {
      if (sample(px, top) === type || sample(px, bottom) === type) return type;
    }
    if (sample(right, top) === type || sample(right, bottom) === type) return type;
    for (let py = top; py < bottom; py += 8) {
      if (sample(left, py) === type || sample(right, py) === type) return type;
    }
  }
  for (const type of [3, 4, 5]) {
    for (let px = left; px < right; px += 8) if (sample(px, bottom) === type) return type;
    if (sample(right, bottom) === type) return type;
  }
  return 0;
}

export function supported(x, y, sample) {
  for (let px = x + BODY.left; px < x + BODY.right; px += 8) {
    const type = sample(px, y + BODY.bottom);
    if (type >= 1 && type <= 4) return true;
  }
  const type = sample(x + BODY.right, y + BODY.bottom);
  return type >= 1 && type <= 4;
}

function setState(p, state) {
  delete p.animationOverride;
  p.state = state;
  p.frame = 0;
  p.ticks = 0;
  if (state === 'chickenAir') { p.flightTicks = 0; p.flapHeld = false; }
}

export function transformPlayer(p, kind) {
  if (kind !== 11 && kind !== 12) throw new Error(`Unknown transformation: ${kind}`);
  setState(p, kind === 11 ? 'chickenIdle' : 'roachIdle');
}

function jumpOrFall(p, input, air, grounded) {
  const jumped = Boolean(input.jump && !p.jumpHeld);
  if (jumped) { setState(p, air); p.vy = -15; p.jumpHeld = true; }
  else if (!input.jump) p.jumpHeld = false;
  if (!grounded) { setState(p, air); p.vy = 4; }
  return jumped;
}

function sideContact(p, sample, right) {
  const x = p.x + (right ? BODY.right : BODY.left);
  for (let y = p.y + BODY.top; y < p.y + BODY.bottom; y += 8) {
    const type = sample(x, y);
    if (type >= 1 && type <= 4) return true;
  }
  return false;
}

export function resolveTerrain(p, oldX, oldY, sample, body = BODY) {
  const hit = bodyCollision(p.x, p.y, sample, body);
  if (hit === 5) {
    p.hazard = true;
    if (p.lives !== undefined) setState(p, 'hurt');
    return 5;
  }
  if (hit === 2) {
    for (let rise = 0; rise < 26; rise++) {
      if (!bodyCollision(p.x, p.y - rise, sample, body)) { p.y -= rise; p.onPlatform = true; return; }
    }
    for (let y = p.y; y >= oldY; y--) {
      if (!bodyCollision(p.x, y, sample, body)) { p.y = y; break; }
    }
    return;
  }
  if (hit === 3 || hit === 4) {
    for (let i = 0; i < 16; i++) {
      if (sideContact(p, sample, hit === 3) || supported(p.x, p.y, sample)) p.x += hit === 3 ? -1 : 1;
    }
    while (supported(p.x, p.y, sample)) p.y--;
    return;
  }
  if (hit !== 1) return;
  // 0x40d4df first lifts up to 25 pixels, then rewinds horizontal and vertical movement.
  for (let rise = 0; rise < 26; rise++) {
    if (!bodyCollision(p.x, p.y - rise, sample, body)) { p.y -= rise; return; }
  }
  if (p.x !== oldX) {
    const direction = Math.sign(oldX - p.x);
    for (let x = p.x; direction > 0 ? x <= oldX : x >= oldX; x += direction) {
      if (!bodyCollision(x, oldY, sample, body)) { p.x = x; break; }
    }
  }
  if (p.y !== oldY) {
    const direction = Math.sign(oldY - p.y);
    for (let y = p.y; direction > 0 ? y <= oldY : y >= oldY; y += direction) {
      if (!bodyCollision(p.x, y, sample, body)) { p.y = y; break; }
    }
  }
}

function fireWeapon(p, input, shots, bored = false) {
  // 0x40678a branches differently for water bombs during the bored animation.
  const triggered = bored && p.selectedItem === 1 ? p.fireHeld : !p.fireHeld;
  if (input.fire && triggered && p.selectedItem < 2) {
    const ammo = p.selectedItem === 0 ? 'balls' : 'waterBombs';
    if (p[ammo] > 0) {
      shots.push({ type: p.selectedItem === 0 ? 65 : 66, x: p.x, y: p.y, vx: p.facing ? 10 : -10, vy: -10 });
      p[ammo]--;
    }
  }
  p.fireHeld = Boolean(input.fire);
}

export function stepPlayer(p, input, sample, shots = [], deferTerrain = false, camera = null) {
  if (p.dead) return false;
  if (camera && p.y > camera.y + 560) p.y = camera.y + 620;
  const oldX = p.x, oldY = p.y;
  p.oldX = oldX; p.oldY = oldY;
  const state = p.state;
  const ground = supported(p.x, p.y + 4, sample);
  const grounded = ground || p.onPlatform;
  let jumped = false;
  let allowHorizontal = false;
  if (state === 'hurt') {
    allowHorizontal = false;
    // 0x406121: life loss occurs after the damage animation, then a 100-tick grace period.
    if (p.frame === 1 && p.ticks === 4) {
      setState(p, 'idle');
      p.lives--;
      p.invulnerable = 100;
      if (p.lives === 0) { p.dead = true; return false; }
      if (p.hazard) {
        p.x = p.y = 0; p.hazard = false; p.moveEnabled = false;
        p.respawnRequested = true;
        return false;
      }
    }
  } else if (state === 'air' || state === 'roachAir') {
    allowHorizontal = true;
    p.ticks = 0;
    if (p.vy < 0) p.frame = 0;
    if (p.vy > 0) p.frame = 1;
    if (p.animationOverride && p.vy !== 0) p.animationOverride.frames = frames[state];
    const canLand = state === 'air' ? grounded : (ground && !sideContact(p, sample, false) && !sideContact(p, sample, true)) || p.onPlatform;
    if (p.vy > 0 && canLand) {
      setState(p, state === 'air' ? 'land' : 'roachLand');
      p.vy = 0;
      allowHorizontal = false;
    }
  } else if (state === 'idleLook' || state === 'bored') {
    if (input.left || input.right) setState(p, 'walk');
    if (p.jumpHeld) { setState(p, 'air'); p.vy = -15; }
    if (!grounded) { setState(p, 'air'); p.vy = 4; }
    if (p.frame === 1 && p.ticks === 4) setState(p, state === 'idleLook' ? 'bored' : 'idle');
    fireWeapon(p, input, shots, state === 'bored');
  } else if (state === 'idle' || state === 'walk' || state === 'land') {
    if (state === 'land' && p.ticks === 5) setState(p, 'idle');
    else {
      allowHorizontal = state !== 'idle';
      if (state === 'idle' && p.ticks === 99) setState(p, 'idleLook');
      if (state === 'idle' && (input.left || input.right)) setState(p, 'walk');
      if (state === 'walk' && !input.left && !input.right && !p.jumpHeld) setState(p, 'idle');
      jumped = jumpOrFall(p, input, 'air', grounded);
      if (state !== 'land') fireWeapon(p, input, shots);
    }
  } else if (['chickenIdle', 'chickenWalk', 'chickenLand'].includes(state)) {
    if (state === 'chickenLand' && p.ticks === 5) setState(p, 'chickenIdle');
    else {
      allowHorizontal = state !== 'chickenIdle';
      if (state === 'chickenIdle' && (input.left || input.right)) setState(p, 'chickenWalk');
      if (state === 'chickenWalk' && !input.left && !input.right && !p.jumpHeld) setState(p, 'chickenIdle');
      jumped = jumpOrFall(p, input, 'chickenAir', grounded);
    }
  } else if (state === 'chickenAir') {
    p.flightTicks++;
    // 0x406628: each released-and-pressed Space gives a weaker flap as this flight ages.
    if (input.fire && !p.flapHeld) { p.vy = Math.min(0, Math.trunc(p.flightTicks / 40) - 8); p.flapHeld = true; }
    else if (!input.fire) p.flapHeld = false;
    if (p.vy > 0 && ((ground && !sideContact(p, sample, false) && !sideContact(p, sample, true)) || p.onPlatform)) {
      setState(p, 'chickenLand');
    } else allowHorizontal = true;
  } else if (['roachIdle', 'roachWalk', 'roachLand'].includes(state)) {
    if (state === 'roachLand' && p.ticks === 4) setState(p, 'roachIdle');
    else {
      allowHorizontal = state !== 'roachIdle';
      if (state === 'roachIdle' && p.ticks === 99) setState(p, 'roachBlink');
      if (state === 'roachIdle' && (input.left || input.right)) setState(p, 'roachWalk');
      if (state === 'roachWalk' && !input.left && !input.right && !p.jumpHeld) setState(p, 'roachIdle');
      jumped = jumpOrFall(p, input, 'roachAir', grounded);
      if (state !== 'roachLand' && input.fire) setState(p, 'roachDash');
    }
  } else if (state === 'roachBlink') {
    if (input.left || input.right) setState(p, 'roachWalk');
    if (p.jumpHeld) { setState(p, 'roachAir'); p.vy = -15; }
    if (!grounded) { setState(p, 'roachAir'); p.vy = 4; }
    if (p.frame === 0 && p.ticks === 4) setState(p, 'roachIdle');
  } else if (state === 'roachDash') {
    if (!grounded) { setState(p, 'roachAir'); p.vy = 4; }
    p.vx = p.facing ? 16 : -16;
    if (p.dashTicks === 20) { setState(p, 'roachRecover'); p.dashTicks = 0; }
    else p.dashTicks++;
  } else if (state === 'roachRecover') {
    if (++p.recoverTicks === 40) { p.recoverTicks = 0; setState(p, 'roachIdle'); }
    if (!grounded) { setState(p, 'roachAir'); p.vy = 4; }
  }
  if (allowHorizontal) {
    if (input.left) { p.vx = -8; p.facing = 0; }
    if (input.right) { p.vx = 8; p.facing = 1; }
  }
  p.vx -= Math.sign(p.vx);
  if (p.vy <= 10) p.vy++;
  p.x = Math.max(0, p.x + (p.moveEnabled ? p.vx : 0));
  p.y = Math.max(0, p.y + p.vy);
  p.ticks++;
  const animation = playerAnimation(p);
  if (p.ticks > animation.period) {
    p.ticks = 0;
    p.frame++;
    if (p.frame >= animation.count) p.frame = 0;
  }
  p.onPlatform = false;
  if (!deferTerrain) resolveTerrain(p, oldX, oldY, sample);
  if (input.enter) p.menuHeld = true;
  else if (p.menuHeld) {
    p.menuHeld = false;
    p.openInventory = true;
    return jumped;
  }
  if (p.invulnerable > 0) p.invulnerable--;
  return jumped;
}

export function playerSprite(p) {
  // shortcut: late intro skip leaves a frame from another atlas; verify the transient out-of-range blit on Windows.
  return `${playerAnimation(p).frames[p.frame] ?? 'stop0'}.app`;
}

export function followCamera(camera, p, map) {
  // Checkpoint placement helper; live frames use the queued camera state in camera.js.
  const stepped = camera.scrollMode === 1;
  // The stepped mode allows the last tile column; its next offset wrap cannot advance that column.
  if (stepped && camera.x >= (map.width - 19) * 32) camera.x -= 32;
  const centerX = p.x + 38 - camera.x;
  let dx = 0;
  if (stepped) {
    const motion = camera.scrollMotion ?? 0;
    if (motion === 0) {
      if (p.x - camera.x < 60) camera.scrollMotion = 1;
      if (p.x - camera.x > 520) camera.scrollMotion = 2;
    } else {
      dx = motion === 1 ? -30 : 30;
      if (Math.abs((motion === 1 ? 540 : 100) - centerX) < 60) camera.scrollMotion = 0;
    }
  } else {
    dx = Math.trunc((centerX - (p.facing ? 170 : 470)) / 30);
    if (dx > 10 && p.vx < 10) dx = 10;
    if (dx < -10 && p.vx > -10) dx = -10;
    if (centerX > 560) dx = 16;
    if (centerX < 80) dx = -16;
  }
  camera.x = stepped ? Math.max(0, camera.x + dx) : clamp(camera.x + dx, 0, map.width * 32 - 641);
  const y = p.y - camera.y;
  const upper = stepped ? 200 : 240;
  if (y < upper || y > 280) {
    let dy = Math.trunc((y + 36 - (y < upper ? upper : 280)) / 6);
    if (y + 36 > 400) dy = 32;
    if (y + 36 < 80) dy = -32;
    if (!stepped && dy !== 0 && Math.abs(dy) < 2) dy = Math.sign(dy) * 2;
    camera.y = clamp(camera.y + dy, 0, map.height * 32 - 481);
  }
}

export function objectPlacement(column, row, dx, dy, width, height) {
  return { x: column * 32 + 16 + dx - Math.trunc(width / 2), y: (row + 1) * 32 + dy - height };
}
