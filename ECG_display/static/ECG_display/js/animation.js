// src/animation.js
export const createAnimationLoop = (
  state,
  ecgModel,
  ecgBuf,
  abpBuf,
  head,
  bufLen,
  redrawECG,
  redrawABP
) => {
  let tClock = 0,
    lastTick = null,
    acc = 0;

  return (ts) => {
    if (!state.playing) {
      lastTick = ts;
      return;
    }
    if (!lastTick) lastTick = ts;
    const dt = Math.max(0, (ts - lastTick) / 1000);
    lastTick = ts;
    acc += dt;
    const toGen = Math.floor(acc * state.fs);
    if (toGen > 0) {
      const step = 1 / state.fs;
      for (let k = 0; k < toGen; k++) {
        tClock += step;
        // generate sample using models
      }
      acc -= toGen * step;
      redrawECG();
      redrawABP();
    }
  };
};
