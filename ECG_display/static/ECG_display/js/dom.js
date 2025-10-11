// static/ECG_display/js/dom.js

export const setupElements = () => {
  const $ = (id) => document.getElementById(id);

  const el = {
    // D3 контейнери
    ecgChart: d3.select("#ecgChart"),
    abpChart: d3.select("#abpChart"),

    // KPI
    hrKpi: $("hrKpi"),
    bpKpi: $("bpKpi"),
    mapKpi: $("mapKpi"),
    emdKpi: $("emdKpi"),
    pttKpi: $("pttKpi"),
    warn: $("warn"),

    // Контроли
    scenarioSelect: $("scenarioSelect"),
    bpm: $("bpm"),
    bpmVal: $("bpmVal"),

    // ⬇️ важливе: сам елемент має id="duration"
    dur: $("duration"),
    durVal: $("durVal"),

    fs: $("fs"),
    ecgAmp: $("ecgAmp"),
    ecgAmpVal: $("ecgAmpVal"),

    // ЕКГ амп/тривалості
    pAmp: $("pAmp"),
    pDur: $("pDur"),
    qAmp: $("qAmp"),
    qrsDur: $("qrsDur"),
    rAmp: $("rAmp"),
    prSeg: $("prSeg"),
    sAmp: $("sAmp"),
    stSeg: $("stSeg"),
    tAmp: $("tAmp"),
    tDur: $("tDur"),
    tpDur: $("tpDur"),
    autoTP: $("autoTP"),

    // ЕКГ рівні
    prLvl: $("prLvl"),
    stLvl: $("stLvl"),
    tpLvl: $("tpLvl"),

    // АТ + монітор
    sys: $("sys"),
    sysN: $("sysN"),
    sysVal: $("sysVal"),
    dia: $("dia"),
    diaN: $("diaN"),
    diaVal: $("diaVal"),
    spo2: $("spo2"),
    spo2N: $("spo2N"),
    spo2Val: $("spo2Val"),
    pi: $("pi"),
    piN: $("piN"),
    piVal: $("piVal"),
    tof: $("tof"),
    tofN: $("tofN"),
    tofVal: $("tofVal"),
    bis: $("bis"),
    bisN: $("bisN"),
    bisVal: $("bisVal"),

    notchPos: $("notchPos"),
    notchPosVal: $("notchPosVal"),
    notchDepth: $("notchDepth"),
    notchDepthVal: $("notchDepthVal"),
    damp: $("damp"),
    dampVal: $("dampVal"),
    aug: $("aug"),
    augVal: $("augVal"),
    tau: $("tau"),
    tauVal: $("tauVal"),
    emd: $("emd"),
    emdVal: $("emdVal"),
    ptt: $("ptt"),
    pttVal: $("pttVal"),

    // Кнопки
    regen: $("regen"),
    toggle: $("togglePlay"),
  };

  // 🔁 АЛІАС: щоб код, який пише el.duration, теж працював
  el.duration = el.dur;

  return el;
};
