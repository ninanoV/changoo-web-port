import { bodyCollision, resolveTerrain } from './game.js';

const images = ['ryoko_s', 'ryoko_w1', 'ryoko_w2', 'ryoko_w3', 'ryoko_w4', 'ryoko_d', 'ryoko_a1', 'ryoko_a2'];
const frames = { 1: [1, 2, 3, 4], 2: [1, 2, 3, 4], 3: [6, 7, 6, 7, 6, 7], 4: [5] };

function change(boss, state) {
  if (state === 3) boss.previousState = boss.state;
  boss.state = state;
  boss.frame = boss.ticks = 0;
  boss.count = frames[state].length;
  boss.period = state === 4 ? 20 : 10;
}

export function createBoss(x, y) {
  return { kind: 18, x, y, oldX: x, oldY: y, vx: 0, vy: 0, state: 1, frame: 0, ticks: 0, count: 4, period: 10,
    timer: 0, previousState: 0, facing: 0, width: 146, height: 177, health: 10,
    body: { left: 48, top: 6, right: 100, bottom: 176 }, removed: false, collected: false, levelComplete: false };
}

export function damageBoss(boss) {
  change(boss, 4);
  boss.health--;
}

export function turnBoss(boss, direction) {
  if (boss.state !== 4 && (direction === 1 || direction === 2)) change(boss, direction);
}

export function stepBoss(boss, player, sample, deferTerrain = false) {
  if (boss.removed) return;
  boss.oldX = boss.x; boss.oldY = boss.y;
  const state = boss.state;
  if (state === 1 || state === 2) {
    if (boss.timer > 200) { change(boss, 3); boss.timer = 0; }
    boss.vx = state === 1 ? -2 : 2;
    boss.facing = state === 1 ? 0 : 1;
  } else if (state === 3) {
    const right = player.x + player.width / 2 >= boss.x + boss.width / 2;
    if (boss.frame === 0 && boss.ticks === 1) { boss.facing = Number(right); boss.vx = right ? 10 : -10; }
    if (boss.frame === 5 && boss.ticks === 9) change(boss, right ? 2 : 1);
  } else if (state === 4) {
    if (boss.frame === 0 && boss.ticks === 0 && boss.health === 0) boss.vy = -10;
    if (boss.frame === 0 && boss.ticks === 9) {
      if (boss.health === 0) {
        boss.period = 10;
        boss.vy = 10;
        boss.removed = boss.levelComplete = true;
        return;
      }
      change(boss, 3);
    }
  }
  boss.vx -= Math.sign(boss.vx);
  if (boss.vy <= 10) boss.vy++;
  boss.x += boss.vx;
  boss.y += boss.vy;
  if (++boss.ticks > boss.period) { boss.ticks = 0; boss.frame = (boss.frame + 1) % boss.count; }
  boss.timer++;
  if (!deferTerrain && bodyCollision(boss.x, boss.y, sample, boss.body) === 1) resolveTerrain(boss, boss.oldX, boss.oldY, sample, boss.body);
}

export function bossSprite(boss) { return `${images[frames[boss.state][boss.frame]]}.app`; }
