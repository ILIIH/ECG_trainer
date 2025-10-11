// models/abpModel.js
import { clamp, easeOutCubic, smoothstep } from "../utils.js";

let fsHz = 500;
let vfTauSec = 4.0;
let vfDecay = Math.exp(-1 / (vfTauSec * fsHz));

export const setAbpFs = (fs) => {
  fsHz = Math.max(10, +fs || 500);
  vfDecay = Math.exp(-1 / (vfTauSec * fsHz));
};

export const setVfTauSec = (sec) => {
  vfTauSec = Math.max(0.5, +sec || 4.0);
  vfDecay = Math.exp(-1 / (vfTauSec * fsHz));
};

let filtAbp = 80;

export const resetFiltAbp = (start) => { filtAbp = start; };

export const pressureAtPhase = (phase, state) => {
  // VF: експоненційний спад перфузії до нуля
  if (state?.scenario === "vf") {
    filtAbp = Math.max(0, filtAbp * vfDecay);
    const smallNoise = (Math.random() * 2 - 1) * (0.5 * Math.max(1, filtAbp) / 100);
    filtAbp = Math.max(0, filtAbp + smallNoise);
    return filtAbp;
  }

  // Асистолія/плоска лінія
  if (state.abpMode === "flatline") {
    const base = Math.max(0, state.dia ?? 0);
    const noise = (Math.random() * 2 - 1) * 1.5;
    filtAbp = base + noise;
    return filtAbp;
  }

  // Нормальна пульсова хвиля
  const PsysModel = state.sys;
  const PdiaModel = Math.min(state.dia, PsysModel - 1);
  const PP = Math.max(1, PsysModel - PdiaModel);

  const upF = 0.12;
  const notchF = clamp(state.notchPos, 0.2, 0.8);
  const tauF = clamp(state.tauRel, 0.1, 1.0);
  const notchP = PsysModel - state.notchDepth * PP;

  let v;
  if (phase < upF) {
    v = PdiaModel + PP * easeOutCubic(phase / upF);
  } else if (phase < notchF) {
    const u = (phase - upF) / (notchF - upF);
    v = PsysModel - (PsysModel - notchP) * smoothstep(u);
    const bumpC = 0.22, bumpW = 0.05, bumpA = state.aug * 0.18 * PP;
    v += bumpA * Math.exp(-0.5 * Math.pow((phase - bumpC) / bumpW, 2));
  } else {
    v = PdiaModel + (notchP - PdiaModel) * Math.exp(-(phase - notchF) / tauF);
  }

  v += (Math.random() * 2 - 1) * 0.5;
  const alpha = 1.0 - clamp(state.damping, 0, 0.95);
  filtAbp = filtAbp + alpha * (v - filtAbp);
  return filtAbp;
};
