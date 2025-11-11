// static/ECG_display/js/state.js
let STATE = {};

const num = (v, d) => (v == null || v === "" ? d : +v);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

export const initState = (el) => {
  STATE = {
    scenario: "baseline",
    ecgMode: "sinus",
    abpMode: "default",

    bpm:      num(el?.bpm?.value, 60),
    duration: num((el?.duration?.value ?? el?.dur?.value), 10),
    fs:       num(el?.fs?.value, 500),
    ecgAmp:   num(el?.ecgAmp?.value, 1.0),

    pAmp:  num(el?.pAmp?.value, 0.12),
    pDur:  num(el?.pDur?.value, 110),
    qAmp:  num(el?.qAmp?.value, -0.15),
    qrsDur:num(el?.qrsDur?.value, 90),
    rAmp:  num(el?.rAmp?.value, 1.0),
    sAmp:  num(el?.sAmp?.value, -0.25),
    tAmp:  num(el?.tAmp?.value, 0.35),
    prSeg: num(el?.prSeg?.value, 160),
    stSeg: num(el?.stSeg?.value, 120),
    tDur:  num(el?.tDur?.value, 180),
    tpDur: num(el?.tpDur?.value, 280),
    autoTP: bool(el?.autoTP?.checked, true),

    prLevel: num(el?.prLvl?.value, 0),
    stLevel: num(el?.stLvl?.value, 0),
    tpLevel: num(el?.tpLvl?.value, 0),

    sys:  num((el?.sysN?.value ?? el?.sys?.value), 120),
    dia:  num((el?.diaN?.value ?? el?.dia?.value), 70),
    spo2: num((el?.spo2N?.value ?? el?.spo2?.value), 98),
    pi:   num((el?.piN?.value ?? el?.pi?.value), 3.2),
    tof:  num((el?.tofN?.value ?? el?.tof?.value), 90),
    bis:  num((el?.bisN?.value ?? el?.bis?.value), 60),

    notchPos:   num(el?.notchPos?.value, 0.36),
    notchDepth: num(el?.notchDepth?.value, 0.20),
    damping:    num(el?.damp?.value, 0.25),
    aug:        num(el?.aug?.value, 0.30),
    tauRel:     num(el?.tau?.value, 0.35),

    emdMs: num(el?.emd?.value, 120),
    pttMs: num(el?.ptt?.value, 80),

    playing: true,
  };
};

export const getState = () => STATE;

// Ось цей експорт і бракував
export const setState = (next) => {
  Object.assign(STATE, next || {});
};
