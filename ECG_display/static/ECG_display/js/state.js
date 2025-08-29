// src/state.js
let state = {};

export const initState = (el) => {
  state = {
    bpm: +el.bpm.value,
    duration: +el.dur.value,
    fs: +el.fs.value,
    ecgAmp: +el.ecgAmp.value,
    // ECG
    pAmp: +el.pAmp.value,
    qAmp: +el.qAmp.value,
    rAmp: +el.rAmp.value,
    sAmp: +el.sAmp.value,
    tAmp: +el.tAmp.value,
    pDur: +el.pDur.value,
    prSeg: +el.prSeg.value,
    qrsDur: +el.qrsDur.value,
    stSeg: +el.stSeg.value,
    tDur: +el.tDur.value,
    tpDur: +el.tpDur.value,
    autoTP: el.autoTP.checked,
    prLevel: +el.prLvl.value,
    stLevel: +el.stLvl.value,
    tpLevel: +el.tpLvl.value,
    // ABP
    sys: +el.sys.value,
    dia: +el.dia.value,
    spo2: +el.spo2.value,
    pi: +el.pi.value,
    tof: +el.tof.value,
    bis: +el.bis.value,
    notchPos: +el.notchPos.value,
    notchDepth: +el.notchDepth.value,
    damping: +el.damp.value,
    aug: +el.aug.value,
    tauRel: +el.tau.value,
    emdMs: +el.emd.value,
    pttMs: +el.ptt.value,
    playing: true,
  };
};

export const getState = () => state;
export const setState = (updates) => Object.assign(state, updates);
