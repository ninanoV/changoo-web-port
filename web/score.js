// SHIN.EXE 0x413830: six digits, 32px spacing; out-of-range digits are not drawn.
export function drawScore(points, drawSprite) {
  let x = 10;
  for (let place = 100000; place >= 1; place /= 10) {
    const digit = Math.trunc(points / place);
    if (digit >= 0 && digit <= 9) drawSprite(`${digit}.app`, x, 10);
    points %= place;
    x += 32;
  }
}
