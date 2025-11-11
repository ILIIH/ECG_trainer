// src/models/ecgModel.js
import { inArc, wrap01, midArc, gaussWrapped } from "../utils.js";

export let ecgModel = null;

export const updateEcgModel = (state) => {
  const Tms = 60000 / state.bpm;
  const minTP = 20;

  let dP = Math.max(5, state.pDur);
  let dPR = Math.max(0, state.prSeg);
  let dQRS = Math.max(40, state.qrsDur);
  let dST = Math.max(0, state.stSeg);
  let dT = Math.max(40, state.tDur);

  let sumOthers = dP + dPR + dQRS + dST + dT;
  let eff = { P: dP, PR: dPR, QRS: dQRS, ST: dST, T: dT, TP: 0 };

  if (state.autoTP) {
    if (sumOthers <= Tms - minTP) {
      eff.TP = Tms - sumOthers;
    } else {
      const s = (Tms - minTP) / sumOthers;
      Object.keys(eff).forEach((k) => (eff[k] *= s));
      eff.TP = minTP;
    }
  } else {
    let dTP = Math.max(0, state.tpDur);
    const total = sumOthers + dTP;
    const s = Tms / total;
    Object.keys(eff).forEach((k) => (eff[k] *= s));
  }

  const fP = eff.P / Tms,
        fPR = eff.PR / Tms,
        fQRS = eff.QRS / Tms,
        fST = eff.ST / Tms,
        fT = eff.T / Tms;

  const qrsStart = wrap01(-fQRS / 2),
        qrsEnd   = wrap01(qrsStart + fQRS),
        pEnd     = wrap01(qrsStart - fPR),
        pStart   = wrap01(pEnd - fP),
        tStart   = wrap01(qrsEnd + fST),
        tEnd     = wrap01(tStart + fT);

  ecgModel = {
    pStart, pEnd, qrsStart, qrsEnd, tStart, tEnd,
    muP: midArc(pStart, pEnd),
    muQ: wrap01(qrsStart + 0.2 * fQRS),
    muR: 0.0,
    muS: wrap01(qrsStart + 0.8 * fQRS),
    muT: midArc(tStart, tEnd),
    sP: Math.max(1e-3, fP / 5),
    sQ: Math.max(1e-3, fQRS * 0.08),
    sR: Math.max(1e-3, fQRS * 0.1),
    sS: Math.max(1e-3, fQRS * 0.08),
    sT: Math.max(1e-3, fT / 5),
    prLevel: state.prLevel,
    stLevel: state.stLevel,
    tpLevel: state.tpLevel,
    effDurMs: eff,
  };
};

export const getEcgModel = () => ecgModel;

export const ecgBaselineAt = (phase, state) => {
  const m = ecgModel;
  if (!m) return state?.tpLevel ?? 0;

  // PR сегмент
  if (inArc(m.pEnd, m.qrsStart, phase)) return m.prLevel;

  // ST сегмент (від кінця QRS до початку T)
  if (inArc(m.qrsEnd, m.tStart, phase)) return m.stLevel;

  // --- НОВЕ: усередині T базова лінія плавно йде від ST → TP ---
  if (inArc(m.tStart, m.tEnd, phase)) {
    // обчислюємо частку шляху всередині дуги T (0 на початку T; 1 в кінці T)
    let s = m.tStart, e = m.tEnd, p = phase;
    if (e < s) e += 1;
    if (p < s) p += 1;
    const u = Math.min(1, Math.max(0, (p - s) / Math.max(1e-6, e - s)));

    // u=0 → рівень ST, u=1 → ізолінія TP
    return m.stLevel * (1 - u) + m.tpLevel * u;
  }

  // TP (ізолінія)
  if (inArc(m.tEnd, m.pStart, phase)) return m.tpLevel;

  // дефолт
  return m.tpLevel;
};

