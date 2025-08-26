document.addEventListener("DOMContentLoaded", () => {
  const $ = (sel) => document.getElementById(sel);
  const on = (node, ev, fn) => node && node.addEventListener(ev, fn);

  const el = {
    ecgChart: d3.select("#ecgChart"),
    abpChart: d3.select("#abpChart"),
    bpm: $("bpm"),
    bpmVal: $("bpmVal"),
    dur: $("duration"),
    durVal: $("durVal"),
    fs: $("fs"),
    ecgAmp: $("ecgAmp"),
    ecgAmpVal: $("ecgAmpVal"),
    // ECG waves/segments
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
    prLvl: $("prLvl"),
    stLvl: $("stLvl"),
    tpLvl: $("tpLvl"),
    // ABP/monitor
    sys: $("sys"),
    sysVal: $("sysVal"),
    sysN: $("sysN"),
    dia: $("dia"),
    diaVal: $("diaVal"),
    diaN: $("diaN"),
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
    regen: $("regen"),
    toggle: $("togglePlay"),
    hrKpi: $("hrKpi"),
    bpKpi: $("bpKpi"),
    mapKpi: $("mapKpi"),
    emdKpi: $("emdKpi"),
    pttKpi: $("pttKpi"),
    warn: $("warn"),
  };

  let state = {
    bpm: +el.bpm.value,
    duration: +el.dur.value,
    fs: +el.fs.value,
    ecgAmp: +el.ecgAmp.value,
    // ECG parameters
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
    // ABP/monitor
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

  const ECG_HEIGHT = 260,
    ABP_HEIGHT = 260;
  const margins = { top: 10, right: 40, bottom: 26, left: 44 };
  let widthEcg = el.ecgChart.node().clientWidth || 900;
  let innerWEcg = widthEcg - margins.left - margins.right;
  let innerHEcg = ECG_HEIGHT - margins.top - margins.bottom;
  let widthAbp = el.abpChart.node().clientWidth || 900;
  let innerWAbp = widthAbp - margins.left - margins.right;
  let innerHAbp = ABP_HEIGHT - margins.top - margins.bottom;

  const ecgY = d3.scaleLinear().domain([-2, 2]).range([innerHEcg, 0]);
  const abpY = d3
    .scaleLinear()
    .domain([0, Math.max(state.sys, state.dia) + 20])
    .range([innerHAbp, 0]);
  const xTimeE = d3
    .scaleLinear()
    .domain([-state.duration, 0])
    .range([0, innerWEcg]);
  const xTimeA = d3
    .scaleLinear()
    .domain([-state.duration, 0])
    .range([0, innerWAbp]);
  const idxToXecg = (i, n) => (i / Math.max(1, n - 1)) * innerWEcg;
  const idxToXabp = (i, n) => (i / Math.max(1, n - 1)) * innerWAbp;

  const ecgSvg = el.ecgChart
    .append("svg")
    .attr("width", "100%")
    .attr("height", ECG_HEIGHT)
    .attr("viewBox", `0 0 ${widthEcg} ${ECG_HEIGHT}`);
  const abpSvg = el.abpChart
    .append("svg")
    .attr("width", "100%")
    .attr("height", ABP_HEIGHT)
    .attr("viewBox", `0 0 ${widthAbp} ${ABP_HEIGHT}`);
  const gE = ecgSvg
    .append("g")
    .attr("transform", `translate(${margins.left},${margins.top})`);
  const gA = abpSvg
    .append("g")
    .attr("transform", `translate(${margins.left},${margins.top})`);
  const gridE = gE.append("g");
  const axesE = gE.append("g");
  const traceE = gE.append("g");
  const gridA = gA.append("g");
  const axesA = gA.append("g");
  const traceA = gA.append("g");

  function drawGrid(group, innerW, innerH) {
    group.selectAll("*").remove();
    group
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("rx", 12)
      .attr("fill", "#0d1430");
    const minorStep = 25 / 5,
      majorStep = 25;
    for (let x = 0; x <= innerW; x += minorStep)
      group
        .append("line")
        .attr("x1", x)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", innerH)
        .attr("stroke", "#223055")
        .attr("stroke-opacity", 0.35)
        .attr("stroke-width", 0.5);
    for (let y = 0; y <= innerH; y += minorStep)
      group
        .append("line")
        .attr("x1", 0)
        .attr("y1", y)
        .attr("x2", innerW)
        .attr("y2", y)
        .attr("stroke", "#223055")
        .attr("stroke-opacity", 0.35)
        .attr("stroke-width", 0.5);
    for (let x = 0; x <= innerW; x += majorStep)
      group
        .append("line")
        .attr("x1", x)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", innerH)
        .attr("stroke", "#223055")
        .attr("stroke-opacity", 0.7)
        .attr("stroke-width", 1);
    for (let y = 0; y <= innerH; y += majorStep)
      group
        .append("line")
        .attr("x1", 0)
        .attr("y1", y)
        .attr("x2", innerW)
        .attr("y2", y)
        .attr("stroke", "#223055")
        .attr("stroke-opacity", 0.7)
        .attr("stroke-width", 1);
  }
  drawGrid(gridE, innerWEcg, innerHEcg);
  drawGrid(gridA, innerWAbp, innerHAbp);

  const ecgPath = traceE
    .append("path")
    .attr("fill", "none")
    .attr(
      "stroke",
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ecg")
        .trim() || "#aaf683"
    )
    .attr("stroke-width", 2)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .style("filter", "drop-shadow(0 0 6px rgba(170,246,131,.35))");
  const abpPath = traceA
    .append("path")
    .attr("fill", "none")
    .attr(
      "stroke",
      getComputedStyle(document.documentElement)
        .getPropertyValue("--abp")
        .trim() || "#f4d35e"
    )
    .attr("stroke-width", 2)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .style("filter", "drop-shadow(0 0 6px rgba(244,211,94,.35))");

  const ecgIso = traceE.append("line").attr("class", "iso");
  const abpIso = traceA.append("line").attr("class", "iso");

  function placeIso() {
    ecgIso
      .attr("x1", 0)
      .attr("x2", innerWEcg)
      .attr("y1", ecgY(0))
      .attr("y2", ecgY(0));
    abpIso
      .attr("x1", 0)
      .attr("x2", innerWAbp)
      .attr("y1", abpY(0))
      .attr("y2", abpY(0));
  }

  function drawAxes() {
    axesE.selectAll("*").remove();
    axesA.selectAll("*").remove();
    const axEleft = d3.axisLeft(ecgY).tickValues([-2, -1, 0, 1, 2]);
    const axEbottom = d3
      .axisBottom(xTimeE)
      .ticks(Math.max(2, Math.min(10, Math.round(state.duration))));
    axesE
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,0)`)
      .call(axEleft);
    axesE
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${innerHEcg})`)
      .call(axEbottom);
    axesE
      .append("text")
      .attr("class", "label")
      .attr("x", innerWEcg)
      .attr("y", innerHEcg + 20)
      .attr("text-anchor", "end")
      .text("час, с (останнє −T…0)");
    axesE
      .append("text")
      .attr("class", "label")
      .attr("x", -8)
      .attr("y", 10)
      .attr("text-anchor", "end")
      .text("мВ");
    const axAleft = d3.axisLeft(abpY).ticks(5);
    const axAbottom = d3
      .axisBottom(xTimeA)
      .ticks(Math.max(2, Math.min(10, Math.round(state.duration))));
    axesA
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,0)`)
      .call(axAleft);
    axesA
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${innerHAbp})`)
      .call(axAbottom);
    axesA
      .append("text")
      .attr("class", "label")
      .attr("x", innerWAbp)
      .attr("y", innerHAbp + 20)
      .attr("text-anchor", "end")
      .text("час, с (останнє −T…0)");
    axesA
      .append("text")
      .attr("class", "label")
      .attr("x", -8)
      .attr("y", 10)
      .attr("text-anchor", "end")
      .text("мм рт. ст.");
  }

  // Монітор поверх ABP
  const monitorG = gA.append("g").attr("class", "monitor");
  const artLabel = monitorG
    .append("text")
    .attr("class", "art")
    .attr("text-anchor", "end")
    .text("ART");
  const bpText = monitorG
    .append("text")
    .attr("class", "bp")
    .attr("text-anchor", "end")
    .text("120/70");
  const mapText = monitorG
    .append("text")
    .attr("class", "map")
    .attr("text-anchor", "end")
    .text("(87)");
  const spo2Line = monitorG
    .append("text")
    .attr("class", "sat")
    .attr("text-anchor", "end")
    .text("SpO₂ 98% (PI 3.2)");
  const tofLine = monitorG
    .append("text")
    .attr("class", "tof")
    .attr("text-anchor", "end")
    .text("TOF 4/4 90%");
  const bisLine = monitorG
    .append("text")
    .attr("class", "bis")
    .attr("text-anchor", "end")
    .text("BIS 60");
  function positionMonitor() {
    const x = innerWAbp - 12;
    artLabel.attr("x", x).attr("y", 14);
    bpText.attr("x", x).attr("y", 36);
    mapText.attr("x", x).attr("y", 52);
    spo2Line.attr("x", x).attr("y", 70);
    tofLine.attr("x", x).attr("y", 86);
    bisLine.attr("x", x).attr("y", 102);
  }

  let bufLen = Math.max(10, Math.round(state.duration * state.fs));
  let ecgBuf = new Float32Array(bufLen).fill(0);
  let abpBuf = new Float32Array(bufLen).fill(state.dia);
  let head = 0;
  function resetBuffers() {
    bufLen = Math.max(10, Math.round(state.duration * state.fs));
    ecgBuf = new Float32Array(bufLen).fill(0);
    abpBuf = new Float32Array(bufLen).fill(state.dia);
    head = 0;
  }
  function pushSamples(e, a) {
    ecgBuf[head] = e;
    abpBuf[head] = a;
    head = (head + 1) % bufLen;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap01 = (x) => ((x % 1) + 1) % 1;
  const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  function gaussWrapped(phase, mu, sigma) {
    let d = phase - mu;
    if (d > 0.5) d -= 1;
    else if (d < -0.5) d += 1;
    return Math.exp(-0.5 * (d / sigma) * (d / sigma));
  }
  function inArc(a, b, x) {
    a = wrap01(a);
    b = wrap01(b);
    x = wrap01(x);
    return a <= b ? x >= a && x < b : x >= a || x < b;
  }
  function midArc(a, b) {
    a = wrap01(a);
    b = wrap01(b);
    if (a <= b) return (a + b) / 2;
    let m = (a + (b + 1)) / 2;
    return m >= 1 ? m - 1 : m;
  }

  // --- ECG MODEL ---
  let ecgModel = null;
  function updateEcgModel() {
    const Tms = 60000 / state.bpm;
    const minTP = 20; // ms
    let dP = Math.max(5, +state.pDur);
    let dPR = Math.max(0, +state.prSeg);
    let dQRS = Math.max(40, +state.qrsDur);
    let dST = Math.max(0, +state.stSeg);
    let dT = Math.max(40, +state.tDur);
    let sumOthers = dP + dPR + dQRS + dST + dT;
    let eff = { P: dP, PR: dPR, QRS: dQRS, ST: dST, T: dT, TP: 0 };
    if (state.autoTP) {
      if (sumOthers <= Tms - minTP) {
        eff.TP = Tms - sumOthers;
      } else {
        const s = (Tms - minTP) / sumOthers;
        eff.P *= s;
        eff.PR *= s;
        eff.QRS *= s;
        eff.ST *= s;
        eff.T *= s;
        eff.TP = minTP;
      }
    } else {
      let dTP = Math.max(0, +state.tpDur);
      const total = Math.max(1, sumOthers + dTP);
      const s = Tms / total;
      eff.P *= s;
      eff.PR *= s;
      eff.QRS *= s;
      eff.ST *= s;
      eff.T *= s;
      eff.TP = dTP * s;
    }
    const fP = eff.P / Tms,
      fPR = eff.PR / Tms,
      fQRS = eff.QRS / Tms,
      fST = eff.ST / Tms,
      fT = eff.T / Tms,
      fTP = eff.TP / Tms;
    const qrsStart = wrap01(-fQRS / 2),
      qrsEnd = wrap01(qrsStart + fQRS);
    const pEnd = wrap01(qrsStart - fPR),
      pStart = wrap01(pEnd - fP);
    const tStart = wrap01(qrsEnd + fST),
      tEnd = wrap01(tStart + fT);
    const model = {
      pStart,
      pEnd,
      qrsStart,
      qrsEnd,
      tStart,
      tEnd,
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
    ecgModel = model;
  }

  function ecgBaselineAt(phase) {
    const m = ecgModel;
    if (!m) return state.tpLevel;
    if (inArc(m.pEnd, m.qrsStart, phase)) return m.prLevel; // PR segment
    if (inArc(m.qrsEnd, m.tStart, phase)) return m.stLevel; // ST segment
    if (inArc(m.tEnd, m.pStart, phase)) return m.tpLevel; // TP/iso
    return m.tpLevel;
  }

  function ecgAtPhase(phase) {
    const m = ecgModel;
    const k = state.ecgAmp;
    let v = ecgBaselineAt(phase);
    v += k * state.pAmp * gaussWrapped(phase, m.muP, m.sP);
    v += k * state.qAmp * gaussWrapped(phase, m.muQ, m.sQ);
    v += k * state.rAmp * gaussWrapped(phase, m.muR, m.sR);
    v += k * state.sAmp * gaussWrapped(phase, m.muS, m.sS);
    v += k * state.tAmp * gaussWrapped(phase, m.muT, m.sT);
    return v;
  }

  // --- ABP MODEL (як було) ---
  let filtAbp = state.dia; // for damping
  function pressureAtPhase(phase) {
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
      const bumpC = 0.22,
        bumpW = 0.05,
        bumpA = state.aug * 0.18 * PP;
      v += bumpA * Math.exp(-0.5 * Math.pow((phase - bumpC) / bumpW, 2));
    } else {
      v = PdiaModel + (notchP - PdiaModel) * Math.exp(-(phase - notchF) / tauF);
    }
    v += (Math.random() * 2 - 1) * 0.5;
    const alpha = 1.0 - clamp(state.damping, 0, 0.95);
    filtAbp = filtAbp + alpha * (v - filtAbp);
    return filtAbp;
  }

  // Real-time measured values
  let prevPhaseA = null;
  let beatMin = 1e9,
    beatMax = -1e9,
    beatSum = 0,
    beatCount = 0;
  let measSys = state.sys,
    measDia = state.dia,
    measMap = Math.round((state.sys + 2 * state.dia) / 3);
  function tofCountFromRatio(r) {
    if (r >= 90) return 4;
    if (r >= 60) return 3;
    if (r >= 30) return 2;
    if (r >= 10) return 1;
    return 0;
  }
  function updateMonitor() {
    bpText.text(`${measSys}/${measDia}`);
    mapText.text(`(${measMap})`);
    spo2Line.text(
      `SpO₂ ${Math.round(state.spo2)}% (PI ${(+state.pi).toFixed(1)})`
    );
    tofLine.text(
      `TOF ${tofCountFromRatio(state.tof)}/4 ${Math.round(state.tof)}%`
    );
    bisLine.text(`BIS ${Math.round(state.bis)}`);
    const badBP =
      measSys >= 180 || measDia <= 40 || measMap < 60 || measMap > 120;
    const badSpO2 = state.spo2 < 90;
    const badBIS = state.bis < 40 || state.bis > 85;
    monitorG.classed("alert", badBP || badSpO2 || badBIS);
  }

  function redrawECG() {
    const n = bufLen;
    let idx = head % n;
    let dStr = "";
    for (let i = 0; i < n; i++) {
      const x = idxToXecg(i, n);
      const y = ecgY(ecgBuf[(idx + i) % n]);
      dStr += i === 0 ? `M${x},${y}` : `L${x},${y}`;
    }
    ecgPath.attr("d", dStr);
    placeIso();
  }
  function redrawABP() {
    const n = bufLen;
    let idx = head % n;
    let dStr = "";
    for (let i = 0; i < n; i++) {
      const x = idxToXabp(i, n);
      const y = abpY(abpBuf[(idx + i) % n]);
      dStr += i === 0 ? `M${x},${y}` : `L${x},${y}`;
    }
    abpPath.attr("d", dStr);
    placeIso();
  }

  function resize() {
    const wE = el.ecgChart.node().clientWidth || widthEcg;
    if (Math.abs(wE - widthEcg) >= 2) {
      widthEcg = wE;
      innerWEcg = widthEcg - margins.left - margins.right;
      innerHEcg = ECG_HEIGHT - margins.top - margins.bottom;
      ecgY.range([innerHEcg, 0]);
      xTimeE.range([0, innerWEcg]);
      ecgSvg.attr("viewBox", `0 0 ${widthEcg} ${ECG_HEIGHT}`);
      drawGrid(gridE, innerWEcg, innerHEcg);
    }
    const wA = el.abpChart.node().clientWidth || widthAbp;
    if (Math.abs(wA - widthAbp) >= 2) {
      widthAbp = wA;
      innerWAbp = widthAbp - margins.left - margins.right;
      innerHAbp = ABP_HEIGHT - margins.top - margins.bottom;
      abpY.range([innerHAbp, 0]);
      xTimeA.range([0, innerWAbp]);
      abpSvg.attr("viewBox", `0 0 ${widthAbp} ${ABP_HEIGHT}`);
      drawGrid(gridA, innerWAbp, innerHAbp);
    }
    drawAxes();
    positionMonitor();
    redrawECG();
    redrawABP();
  }
  window.addEventListener("resize", resize);

  let tClock = 0,
    lastTick = null,
    acc = 0;
  function stepSample(t) {
    const T = 60.0 / state.bpm;
    const phaseE = wrap01(t / T);
    const delay = (state.emdMs + state.pttMs) / 1000;
    const phaseA = wrap01((t - delay) / T);
    const ecg = ecgAtPhase(phaseE) + (Math.random() * 2 - 1) * 0.01;
    const abp = pressureAtPhase(phaseA);
    pushSamples(ecg, abp);
    if (abp < beatMin) beatMin = abp;
    if (abp > beatMax) beatMax = abp;
    beatSum += abp;
    beatCount++;
    if (prevPhaseA !== null && phaseA < prevPhaseA) {
      measSys = Math.round(beatMax);
      measDia = Math.round(beatMin);
      measMap = Math.round(beatSum / Math.max(1, beatCount));
      updateMonitor();
      updateKpis();
      beatMin = 1e9;
      beatMax = -1e9;
      beatSum = 0;
      beatCount = 0;
    }
    prevPhaseA = phaseA;
  }

  function frame(ts) {
    if (!state.playing) {
      lastTick = ts;
      return;
    }
    if (lastTick == null) lastTick = ts;
    const dt = Math.max(0, (ts - lastTick) / 1000);
    lastTick = ts;
    acc += dt;
    const toGen = Math.floor(acc * state.fs);
    if (toGen > 0) {
      const step = 1 / state.fs;
      for (let k = 0; k < toGen; k++) {
        tClock += step;
        stepSample(tClock);
      }
      acc -= toGen * (1 / state.fs);
      redrawECG();
      redrawABP();
    }
  }
  d3.timer(frame);

  function prefill() {
    const step = 1 / state.fs;
    let t = -state.duration;
    filtAbp = state.dia;
    prevPhaseA = null;
    beatMin = 1e9;
    beatMax = -1e9;
    beatSum = 0;
    beatCount = 0;
    for (let i = 0; i < bufLen; i++) {
      stepSample(t);
      t += step;
    }
  }

  function updateKpis() {
    el.hrKpi.textContent = Math.round(state.bpm);
    el.bpKpi.textContent = `${measSys}/${measDia}`;
    el.mapKpi.textContent = measMap;
    el.emdKpi.textContent = Math.round(state.emdMs);
    el.pttKpi.textContent = Math.round(state.pttMs);
    const warn = state.sys <= state.dia + 0;
    el.warn.textContent = warn
      ? " | САТ≤ДАТ: крива змодельована зі САТ>ДАТ"
      : "";
  }
  function refreshAbpScale() {
    abpY.domain([0, Math.max(40, Math.max(state.sys, state.dia)) + 20]);
    drawGrid(gridA, innerWAbp, innerHAbp);
    placeIso();
    drawAxes();
    positionMonitor();
  }

  // two-way binding helpers (ABP/monitor)
  function sliderFollow(slider, min, max, v) {
    if (!slider) return;
    const vv =
      isFinite(min) && isFinite(max) ? Math.max(min, Math.min(max, v)) : v;
    slider.value = vv;
  }
  function syncSysUI() {
    el.sysVal.textContent = state.sys;
    sliderFollow(el.sys, 80, 220, state.sys);
    if (el.sysN) el.sysN.value = state.sys;
  }
  function syncDiaUI() {
    el.diaVal.textContent = state.dia;
    sliderFollow(el.dia, 40, 120, state.dia);
    if (el.diaN) el.diaN.value = state.dia;
  }
  function syncSpO2UI() {
    el.spo2Val.textContent = state.spo2;
    sliderFollow(el.spo2, 50, 100, state.spo2);
    if (el.spo2N) el.spo2N.value = state.spo2;
  }
  function syncPiUI() {
    el.piVal.textContent = (+state.pi).toFixed(1);
    sliderFollow(el.pi, 0, 20, state.pi);
    if (el.piN) el.piN.value = state.pi;
  }
  function syncTofUI() {
    el.tofVal.textContent = Math.round(state.tof);
    sliderFollow(el.tof, 0, 100, state.tof);
    if (el.tofN) el.tofN.value = state.tof;
  }
  function syncBisUI() {
    el.bisVal.textContent = Math.round(state.bis);
    sliderFollow(el.bis, 0, 100, state.bis);
    if (el.bisN) el.bisN.value = state.bis;
  }

  function afterSysDiaChange() {
    measSys = Math.round(state.sys);
    measDia = Math.round(state.dia);
    measMap = Math.round((measSys + 2 * measDia) / 3);
    updateMonitor();
    updateKpis();
    refreshAbpScale();
    prefill();
    redrawABP();
  }

  // === Bind controls ===
  on(el.bpm, "input", (e) => {
    state.bpm = +e.target.value;
    el.bpmVal.textContent = state.bpm;
    updateEcgModel();
    prefill();
    updateKpis();
  });
  on(el.duration, "input", (e) => {
    state.duration = +e.target.value;
    el.durVal.textContent = state.duration;
    xTimeE.domain([-state.duration, 0]);
    xTimeA.domain([-state.duration, 0]);
    resetBuffers();
    prefill();
    drawAxes();
    redrawECG();
    redrawABP();
  });
  on(el.fs, "change", (e) => {
    state.fs = +e.target.value;
    resetBuffers();
    prefill();
    redrawECG();
    redrawABP();
  });

  on(el.ecgAmp, "input", (e) => {
    state.ecgAmp = +e.target.value;
    el.ecgAmpVal.textContent = state.ecgAmp.toFixed(2);
  });

  const updModel = () => {
    updateEcgModel();
  };
  ["input", "change"].forEach((ev) => {
    on(el.pAmp, ev, (e) => {
      state.pAmp = +e.target.value;
    });
    on(el.qAmp, ev, (e) => {
      state.qAmp = +e.target.value;
    });
    on(el.rAmp, ev, (e) => {
      state.rAmp = +e.target.value;
    });
    on(el.sAmp, ev, (e) => {
      state.sAmp = +e.target.value;
    });
    on(el.tAmp, ev, (e) => {
      state.tAmp = +e.target.value;
    });

    on(el.pDur, ev, (e) => {
      state.pDur = +e.target.value;
      updModel();
      prefill();
    });
    on(el.prSeg, ev, (e) => {
      state.prSeg = +e.target.value;
      updModel();
      prefill();
    });
    on(el.qrsDur, ev, (e) => {
      state.qrsDur = +e.target.value;
      updModel();
      prefill();
    });
    on(el.stSeg, ev, (e) => {
      state.stSeg = +e.target.value;
      updModel();
      prefill();
    });
    on(el.tDur, ev, (e) => {
      state.tDur = +e.target.value;
      updModel();
      prefill();
    });
    on(el.tpDur, ev, (e) => {
      state.tpDur = +e.target.value;
      updModel();
      prefill();
    });
    on(el.autoTP, ev, (e) => {
      state.autoTP = e.target.checked;
      updModel();
      prefill();
    });

    on(el.prLvl, ev, (e) => {
      state.prLevel = +e.target.value;
    });
    on(el.stLvl, ev, (e) => {
      state.stLevel = +e.target.value;
    });
    on(el.tpLvl, ev, (e) => {
      state.tpLevel = +e.target.value;
    });
  });

  on(el.sys, "input", (e) => {
    state.sys = +e.target.value;
    syncSysUI();
    afterSysDiaChange();
  });
  on(el.sysN, "input", (e) => {
    state.sys = +e.target.value;
    syncSysUI();
    afterSysDiaChange();
  });
  on(el.dia, "input", (e) => {
    state.dia = +e.target.value;
    syncDiaUI();
    afterSysDiaChange();
  });
  on(el.diaN, "input", (e) => {
    state.dia = +e.target.value;
    syncDiaUI();
    afterSysDiaChange();
  });

  on(el.spo2, "input", (e) => {
    state.spo2 = +e.target.value;
    syncSpO2UI();
    updateMonitor();
  });
  on(el.spo2N, "input", (e) => {
    state.spo2 = +e.target.value;
    syncSpO2UI();
    updateMonitor();
  });
  on(el.pi, "input", (e) => {
    state.pi = +e.target.value;
    syncPiUI();
    updateMonitor();
  });
  on(el.piN, "input", (e) => {
    state.pi = +e.target.value;
    syncPiUI();
    updateMonitor();
  });
  on(el.tof, "input", (e) => {
    state.tof = +e.target.value;
    syncTofUI();
    updateMonitor();
  });
  on(el.tofN, "input", (e) => {
    state.tof = +e.target.value;
    syncTofUI();
    updateMonitor();
  });
  on(el.bis, "input", (e) => {
    state.bis = +e.target.value;
    syncBisUI();
    updateMonitor();
  });
  on(el.bisN, "input", (e) => {
    state.bis = +e.target.value;
    syncBisUI();
    updateMonitor();
  });

  on(el.notchPos, "input", (e) => {
    state.notchPos = +e.target.value;
    el.notchPosVal.textContent = state.notchPos.toFixed(2);
  });
  on(el.notchDepth, "input", (e) => {
    state.notchDepth = +e.target.value;
    el.notchDepthVal.textContent = state.notchDepth.toFixed(2);
  });
  on(el.damp, "input", (e) => {
    state.damping = +e.target.value;
    el.dampVal.textContent = state.damping.toFixed(2);
  });
  on(el.aug, "input", (e) => {
    state.aug = +e.target.value;
    el.augVal.textContent = state.aug.toFixed(2);
  });
  on(el.tau, "input", (e) => {
    state.tauRel = +e.target.value;
    el.tauVal.textContent = state.tauRel.toFixed(2);
  });
  on(el.emd, "input", (e) => {
    state.emdMs = +e.target.value;
    el.emdVal.textContent = state.emdMs;
    updateKpis();
  });
  on(el.ptt, "input", (e) => {
    state.pttMs = +e.target.value;
    el.pttVal.textContent = state.pttMs;
    updateKpis();
  });

  on(el.regen, "click", () => {
    tClock = 0;
    acc = 0;
    resetBuffers();
    prefill();
    drawAxes();
    redrawECG();
    redrawABP();
    updateMonitor();
  });
  on(el.toggle, "click", () => {
    state.playing = !state.playing;
    el.toggle.textContent = state.playing ? "Pause" : "Play";
    lastTick = null;
  });

  const toggleBtn = document.getElementById("toggleControls");
  const controls = document.querySelector(".controls");
  const settingsTitle = document.getElementById("settingsTitle");

  toggleBtn.addEventListener("click", () => {
    console.log("hide . show ");
    // toggle class to hide/show children
    const content = Array.from(controls.children).filter(
      (el) => el !== toggleBtn && el !== settingsTitle
    );
    const isHidden = content[0].style.display === "none";

    content.forEach((el) => (el.style.display = isHidden ? "" : "none"));
    toggleBtn.textContent = isHidden ? "−" : "+";
  });

  // init
  positionMonitor();
  updateEcgModel();
  resetBuffers();
  prefill();
  placeIso();
  drawAxes();
  updateMonitor();
  updateKpis();
  redrawECG();
  redrawABP();
  el.toggle.textContent = "Pause";
});
