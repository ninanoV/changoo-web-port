const images = {
  2: ['motheraa', 'motherab', 'motherac', 'motherba', 'motherbb', 'motherbc', 'motherbd'],
  3: ['fa-1', 'fa-2', 'fa-3', 'fa-4', 'fa-6'],
  5: ['ymothaa', 'ymothab', 'ymothac', 'ymothad', 'ymothba', 'ymothbb', 'ymothbc', 'ymothbd'],
  6: ['twingaa', 'twingab', 'twingba', 'twingbb'],
  7: ['mamsc2aa', 'mamsc2ba', 'mamsc2ab', 'mamsc2bb'],
};
const animations = {
  2: { 0: [[0], 500], 1: [[1], 50], 2: [[2], 500], 3: [[3, 4, 5, 6], 10] },
  3: { 0: [[0], 500], 1: [[1, 2, 3, 2, 3, 2, 3, 2, 3], 10], 2: [[4], 500] },
  5: { 0: [[0], 500], 1: [[1, 2, 3], 10], 3: [[4, 5, 6, 7], 10], 4: [[0], 20] },
  6: { 0: [[0], 500], 1: [[1], 100], 2: [Array.from({ length: 20 }, (_, i) => 2 + i % 2), 1] },
  7: { 0: [[0, 1, 2, 3], 10] },
};

function change(ally, state) {
  ally.state = state;
  ally.frame = ally.ticks = 0;
  const [frames, period] = animations[ally.slot][state];
  ally.count = frames.length;
  ally.period = period;
}

function nearest(ally, enemies) {
  let best = 10000, target = null;
  for (const enemy of enemies) {
    const distance = Math.abs(ally.x - enemy.x);
    if (distance < best) { best = distance; target = { x: enemy.x, y: enemy.y }; }
  }
  return target;
}

export function createCompanion(slot, cost, camera) {
  if (!images[slot]) throw new Error(`Unknown companion: ${slot}`);
  const ally = { slot, cost, x: camera.x + (slot === 3 ? 0 : slot === 6 ? 10 : slot === 7 ? 400 : 100),
    y: camera.y + (slot === 3 ? -100 : slot >= 6 ? 50 : 0), vx: 0, vy: 0,
    frame: 0, ticks: 0, count: 0, period: 10, state: 0, departing: 0, screenX: 0, screenY: 0,
    initialized: slot >= 6, born: true, removed: false, target: null,
    body: slot === 6 ? { left: -200, top: -200, right: 800, bottom: 400 }
      : slot === 7 ? { left: 0, top: 0, right: 300, bottom: 300 } : { left: 33, top: 62, right: 100, bottom: 217 },
    startSounds: slot === 6 ? [] : [slot === 3 ? 'FATHER.WAV' : slot === 7 ? 'ITEM-3.WAV' : 'ITEM-1.WAV'] };
  if (ally.initialized) change(ally, 0);
  return ally;
}

export function stepCompanion(ally, player, camera, enemies) {
  const effects = { sounds: [], clear: false, rabbit: null };
  if (ally.removed) return effects;
  ally.born = false;
  if (!ally.initialized) { change(ally, ally.slot === 2 && ally.cost === 1 ? 2 : 0); ally.initialized = true; }
  if (ally.slot < 6 && Math.abs(ally.x - camera.x - 320) > 960) ally.removed = true;
  const state = ally.state;
  if (ally.slot === 2) {
    if (state === 0 || state === 2) {
      if (!ally.departing && ally.screenY > 100) {
        change(ally, ally.cost === 1 && state === 2 ? 3 : 1);
        if (ally.cost === 1 && state === 2) ally.target = nearest(ally, enemies);
      } else if (ally.departing && ally.screenY > 400) ally.removed = true;
      ally.vy = 4;
    } else {
      if (state === 1 && ally.ticks === 49) { change(ally, 0); effects.clear = true; ally.departing = 1; }
      if (state === 3 && (ally.cost === 2 ? ally.ticks === 49 : ally.frame === 3 && ally.ticks === 9)) {
        change(ally, 0); ally.departing = 1;
      }
      ally.vy = 0;
      if (ally.cost === 1 && ally.target) {
        ally.x += Math.trunc((ally.target.x - ally.x) / 2);
        if (state === 3) ally.y += Math.trunc((ally.target.y - ally.y) / 2);
      }
    }
  } else if (ally.slot === 3) {
    if (state === 0 || state === 2) {
      if (!ally.departing && ally.screenY > 100) change(ally, 1);
      else if (ally.departing && ally.screenY > 400) ally.removed = true;
      ally.vy = 4;
    } else {
      if (ally.frame === 8 && ally.ticks === 9) { effects.clear = true; change(ally, 2); ally.departing = 1; }
      ally.vy = 0;
    }
  } else if (ally.slot === 5) {
    if (state === 0) {
      if (!ally.departing && ally.screenY > 100) change(ally, 1);
      else if (ally.departing && ally.screenY > 400) ally.removed = true;
      ally.vy = 4;
    } else if (state === 1) {
      if (ally.ticks === 9 && ally.frame === 2) change(ally, 4);
      if (ally.ticks === 9 && ally.frame === 1) {
        const target = nearest(ally, enemies);
        if (!target) { ally.removed = true; return effects; }
        effects.rabbit = { x: ally.x, y: ally.y, vx: Math.trunc((target.x - ally.x) / 20), vy: -15 };
      }
      ally.vy = 0;
    } else if (state === 3) {
      if (ally.frame === 3 && ally.ticks === 9) { change(ally, 0); ally.departing = 1; }
      ally.vy = 0;
      const target = nearest(ally, enemies);
      if (target) { ally.x += Math.trunc((target.x - ally.x) / 2); ally.y += Math.trunc((target.y - ally.y) / 2); }
    } else if (state === 4) {
      if (ally.ticks === 19) change(ally, 3);
      ally.vy = 0;
    }
  } else if (ally.slot === 6) {
    if (state === 0) {
      if (ally.screenX > 100) change(ally, 1);
      ally.vx = 6;
    } else if (state === 1) {
      if (ally.ticks === 4) { change(ally, 2); effects.sounds.push('ITEMSHO.WAV'); }
      ally.vx = 0;
    } else if (ally.frame === 19 && ally.ticks === 0) ally.removed = true;
  } else if (ally.slot === 7) {
    if (ally.screenX < 0) ally.removed = true;
    ally.vx = -6;
  }
  // Native conditions and rendering use the previous screen position, before this tick's motion.
  ally.screenX = ally.x - camera.x;
  ally.screenY = ally.y - camera.y;
  if (ally.slot < 6) ally.vx -= Math.sign(ally.vx);
  if (ally.slot === 3) ally.x += Math.trunc((player.x - ally.x - 50) / 2);
  ally.x += ally.vx;
  ally.y += ally.vy;
  if (++ally.ticks > ally.period) { ally.ticks = 0; ally.frame = (ally.frame + 1) % ally.count; }
  return effects;
}

export function companionSprite(ally) {
  return `${images[ally.slot][animations[ally.slot][ally.state][0][ally.frame]]}.app`;
}

function dogState(dog, state) {
  dog.state = state;
  dog.frame = dog.ticks = 0;
  dog.count = state === 0 ? 2 : 1;
  dog.period = state === 0 ? 10 : 50;
}

export function createDog() {
  return { slot: 4, x: 10, y: 400, screenX: 10, screenY: 400, state: 0, frame: 0, ticks: 0, count: 2, period: 10,
    body: { left: 0, top: 0, right: 74, bottom: 71 } };
}

export function activateDog(dog) { dogState(dog, 1); }

export function stepDog(dog, player, camera, enemies) {
  const state = dog.state;
  if (state >= 1 && state <= 4 && dog.ticks === 49) dogState(dog, state === 4 ? 0 : state + 1);
  if (state === 3 && enemies.length) {
    dog.x += Math.trunc((enemies[0].x - dog.x) / 2);
    dog.y += Math.trunc((enemies[0].y - dog.y) / 2);
  }
  if (dog.state !== 3) {
    dog.x = player.x; dog.y = player.y;
    dog.screenX = 10; dog.screenY = 400;
  } else { dog.screenX = dog.x - camera.x; dog.screenY = dog.y - camera.y; }
  if (++dog.ticks > dog.period) { dog.ticks = 0; dog.frame = (dog.frame + 1) % dog.count; }
}

export function dogSprite(dog) {
  return dog.state === 0 ? `siro${dog.frame}.app` : `siros${dog.state}.app`;
}

export function createRabbit(shot) { return { ...shot, frame: 0, ticks: 0, born: true, removed: false }; }

export function stepRabbit(rabbit, camera) {
  rabbit.born = false;
  if (Math.abs(rabbit.x - camera.x - 320) > 960 || (rabbit.frame === 3 && rabbit.ticks === 4)) rabbit.removed = true;
  if (rabbit.vy <= 10) rabbit.vy++;
  rabbit.x += rabbit.vx;
  rabbit.y += rabbit.vy;
  if (++rabbit.ticks > 5) { rabbit.ticks = 0; rabbit.frame = (rabbit.frame + 1) % 4; }
}
