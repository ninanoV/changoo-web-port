// SHIN.EXE 0x44f660; state belongs to the game session, not an individual actor.
export function nextRandom(state) {
  state.randomSeed = (Math.imul(state.randomSeed, 214013) + 2531011) >>> 0;
  return (state.randomSeed >>> 16) & 0x7fff;
}
