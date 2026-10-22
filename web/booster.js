import { BOOSTER_POSES } from './booster-data.js';
import { resolveTerrain, playerAnimation } from './game.js';

function change(player, state) {
  player.state = { 26: 'booster', 27: 'boostHurt', 28: 'boostAttack' }[state];
  player.frame = player.ticks = 0;
  player.animationOverride = BOOSTER_POSES[state];
}

export function enterBooster(player) {
  player.flight = false;
  player.booster = true;
  player.boostReady = player.flightReady ?? false;
  change(player, 26);
}

export function hurtBooster(player) { change(player, 27); player.vx = -5; }

export function stepBooster(player, input, camera, map, sample, deferTerrain = false) {
  const shots = [];
  if (player.dead) return shots;
  player.oldX = player.x; player.oldY = player.y;
  if (player.state === 'booster') player.boostReady = true;
  else if (player.state === 'boostHurt' && player.frame === 0 && player.ticks === 9) {
    change(player, 26); player.lives--; player.invulnerable = 100;
    if (player.lives === 0) { player.dead = true; return shots; }
  } else if (player.state === 'boostAttack' && player.frame === 1) {
    if (player.ticks === 1) shots.push({ type: 35, x: player.x + (player.facing ? 80 : 21), y: player.y + 36, vx: player.facing ? 12 : -12, vy: 0 });
    if (player.ticks === 4) change(player, 26);
  }
  if (input.up && player.vy > -8) player.vy -= 2;
  if (input.down && player.vy < 10) player.vy += 2;
  if (input.left) { if (player.vx > -8) player.vx -= 2; player.facing = 0; }
  if (input.right) { if (player.vx < 8) player.vx += 2; player.facing = 1; }
  if (input.fire && !player.fireHeld && player.state !== 'boostHurt') change(player, 28);
  player.fireHeld = Boolean(input.fire);
  player.vx -= Math.sign(player.vx);
  if (player.vy > 0) player.vy--;
  if (player.vy <= 10) player.vy++;
  player.x = Math.max(0, Math.min(map.width * 32, player.x + player.vx));
  player.y = Math.max(-30, Math.min(map.height * 32 - 40, player.y + player.vy));
  player.x = Math.max(camera.x, Math.min(camera.x + 500, player.x));
  const animation = playerAnimation(player);
  if (++player.ticks > animation.period) { player.ticks = 0; player.frame = (player.frame + 1) % animation.count; }
  if (player.invulnerable > 0) player.invulnerable--;
  if (!deferTerrain) resolveTerrain(player, player.oldX, player.oldY, sample);
  return shots;
}
