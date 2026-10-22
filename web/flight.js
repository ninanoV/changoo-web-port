import { FLIGHT_IMAGES } from './flight-data.js';

const animations = Object.fromEntries(Object.entries(FLIGHT_IMAGES).map(([state, names]) => [state,
  { frames: names.map((name) => name.slice(0, -4)), count: names.length, period: 10 }]));
export function setFlightState(player, state) {
  player.state = state === 18 ? 'flight' : 'flightHurt';
  player.frame = player.ticks = 0;
  player.animationOverride = animations[state];
}

export function enterFlight(player) {
  player.booster = false;
  player.flight = true;
  player.flightReady = false;
  player.burst = 0;
  setFlightState(player, 18);
}

export function hurtFlight(player) { setFlightState(player, 19); player.vx = -5; }

export function stepFlight(player, input, camera, map, stopped = false) {
  const shots = [];
  if (player.dead) return shots;
  player.facing = 1;
  player.oldX = player.x; player.oldY = player.y;
  if (player.state === 'flight') player.flightReady = true;
  if (player.state === 'flightHurt' && player.frame === 0 && player.ticks === 9) {
    setFlightState(player, 18); player.lives--; player.invulnerable = 100;
    if (player.lives === 0) { player.dead = true; return shots; }
  }
  if (input.up) player.vy = -12;
  if (input.down) player.vy = 12;
  if (input.left) player.vx = -8;
  if (input.right) player.vx = 8;
  if (input.fire && !player.fireHeld) player.burst = 3;
  player.fireHeld = Boolean(input.fire);
  if (player.burst > 0) {
    shots.push({ type: 35, x: player.x + 93, y: player.y + 49, vx: 24, vy: 0 });
    player.burst--;
  }
  player.vx -= Math.sign(player.vx); player.vy -= Math.sign(player.vy);
  player.x = Math.max(0, Math.min(map.width * 32, player.x + player.vx + (stopped ? 0 : 3)));
  player.y = Math.max(-30, Math.min(map.height * 32 - 80, player.y + player.vy));
  player.x = Math.max(camera.x, Math.min(camera.x + 480, player.x));
  if (++player.ticks > 10) { player.ticks = 0; player.frame = (player.frame + 1) % player.animationOverride.count; }
  if (player.invulnerable > 0) player.invulnerable--;
  return shots;
}

export function stepFlightCamera(camera, player, map, stopped = false) {
  camera.x = Math.max(0, Math.min(map.width * 32 - 641, camera.nextX ?? camera.x));
  camera.y = Math.max(0, Math.min(map.height * 32 - 481, camera.nextY ?? camera.y));
  const column = Math.floor(camera.x / 32), row = Math.floor(camera.y / 32);
  let dx = camera.x % 32, dy = camera.y % 32;
  if (player.y < camera.y + 200) {
    dy += Math.trunc((player.y - camera.y - 200) / 2);
    if (row === 0 && dy < 0) dy = 0;
  }
  if (player.y > camera.y + 280) {
    dy += Math.trunc((player.y - camera.y - 280) / 2);
    if (map.height - row === 16 && dy >= 32) dy = 31;
  }
  if (!stopped) {
    dx += 3;
    if (map.width - column === 21 && dx >= 32) dx = 31;
  }
  camera.nextX = column * 32 + dx; camera.nextY = row * 32 + dy;
}
