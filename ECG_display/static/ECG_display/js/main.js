// src/main.js
import { setupElements } from "./dom.js";
import { initState, getState, setState } from "./state.js";
import { setupCharts, drawGrid } from "./ui/charts.js";
import { setupTraces, redrawECG, redrawABP } from "./ui/rendering.js";
import { setupMonitor } from "./ui/monitor.js";
import { updateEcgModel, ecgAtPhase, getEcgModel } from "./models/ecgModel.js";
import { pressureAtPhase, resetFiltAbp } from "./models/abpModel.js";
import { clamp, wrap01 } from "./utils.js";
import { setupControls } from "./controls.js";

// Animation loop
let tClock = 0;
let lastTick = null;
let acc = 0;

document.addEventListener("DOMContentLoaded", () => {
  const el = setupElements();
  initState(el);
  const state = getState();

  // Setup chart layout
  const chartData = setupCharts(el, state);
  const {
    ecgY,
    abpY,
    xTimeE,
    xTimeA,
    gE,
    gA,
    ecgSvg,
    abpSvg,
    gridE,
    axesE,
    traceE,
    gridA,
    axesA,
    traceA,
    innerWEcg,
    innerHEcg,
    innerWAbp,
    innerHAbp,
    ECG_HEIGHT,
    ABP_HEIGHT,
    margins,
  } = chartData;

  // Setup traces and isolines
  const { ecgPath, abpPath, ecgIso, abpIso } = setupTraces(traceE, traceA);

  // Setup monitor overlay
  const {
    updateMonitor: updateMonitorUI,
    positionMonitor,
    tofCountFromRatio,
  } = setupMonitor(gA, innerWAbp);

  // Initial draw
  drawGrid(gridE, innerWEcg, innerHEcg);
  drawGrid(gridA, innerWAbp, innerHAbp);

  // Axes
  const drawAxes = () => {
    axesE.selectAll("*").remove();
    axesA.selectAll("*").remove();

    const axEleft = d3.axisLeft(ecgY).tickValues([-2, -1, 0, 1, 2]);
    const axEbottom = d3
      .axisBottom(xTimeE)
      .ticks(Math.max(2, Math.min(10, Math.round(state.duration))));
    axesE.append("g").attr("class", "axis").call(axEleft);
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
    axesA.append("g").attr("class", "axis").call(axAleft);
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
  };
  drawAxes();

  // Buffers
  let bufLen = Math.max(10, Math.round(state.duration * state.fs));
  let ecgBuf = new Float32Array(bufLen).fill(0);
  let abpBuf = new Float32Array(bufLen).fill(state.dia);
  let head = 0;

  const resetBuffers = () => {
    bufLen = Math.max(10, Math.round(state.duration * state.fs));
    ecgBuf = new Float32Array(bufLen).fill(0);
    abpBuf = new Float32Array(bufLen).fill(state.dia);
    head = 0;
  };

  const idxToXecg = (i, n) => (i / Math.max(1, n - 1)) * innerWEcg;
  const idxToXabp = (i, n) => (i / Math.max(1, n - 1)) * innerWAbp;

  // Real-time measurement tracking
  let prevPhaseA = null;
  let beatMin = 1e9,
    beatMax = -1e9,
    beatSum = 0,
    beatCount = 0;
  let measSys = state.sys,
    measDia = state.dia,
    measMap = Math.round((state.sys + 2 * state.dia) / 3);

  const updateKpis = () => {
    el.hrKpi.textContent = Math.round(state.bpm);
    el.bpKpi.textContent = `${measSys}/${measDia}`;
    el.mapKpi.textContent = measMap;
    el.emdKpi.textContent = Math.round(state.emdMs);
    el.pttKpi.textContent = Math.round(state.pttMs);
    const warn = state.sys <= state.dia;
    el.warn.textContent = warn
      ? " | САТ≤ДАТ: крива змодельована зі САТ>ДАТ"
      : "";
  };

  const refreshAbpScale = () => {
    abpY.domain([0, Math.max(40, Math.max(state.sys, state.dia)) + 20]);
    drawGrid(gridA, innerWAbp, innerHAbp);
    drawAxes();
    positionMonitor();
    redrawABP(
      abpBuf,
      head,
      bufLen,
      idxToXabp,
      abpY,
      abpPath,
      abpIso,
      innerWAbp,
      innerHAbp
    );
  };

  // Pre-fill buffer
  const prefill = () => {
    const step = 1 / state.fs;
    let t = -state.duration;
    resetFiltAbp(state.dia);
    prevPhaseA = null;
    beatMin = 1e9;
    beatMax = -1e9;
    beatSum = 0;
    beatCount = 0;

    for (let i = 0; i < bufLen; i++) {
      const T = 60.0 / state.bpm;
      const phaseE = wrap01(t / T);
      const delay = (state.emdMs + state.pttMs) / 1000;
      const phaseA = wrap01((t - delay) / T);

      const ecg =
        ecgAtPhase(phaseE, state, getEcgModel()) +
        (Math.random() * 2 - 1) * 0.01;
      const abp = pressureAtPhase(phaseA, state);

      ecgBuf[head] = ecg;
      abpBuf[head] = abp;
      head = (head + 1) % bufLen;

      if (abp < beatMin) beatMin = abp;
      if (abp > beatMax) beatMax = abp;
      beatSum += abp;
      beatCount++;

      if (prevPhaseA !== null && phaseA < prevPhaseA) {
        measSys = Math.round(beatMax);
        measDia = Math.round(beatMin);
        measMap = Math.round(beatSum / Math.max(1, beatCount));
        updateMonitorUI(measSys, measDia, measMap, state);
        updateKpis();
        beatMin = 1e9;
        beatMax = -1e9;
        beatSum = 0;
        beatCount = 0;
      }
      prevPhaseA = phaseA;
      t += step;
    }
    head = 0; // rewind head for real-time
  };

  // Resize handler
  const resize = () => {
    const wE = el.ecgChart.node().clientWidth || chartData.widthEcg;
    if (Math.abs(wE - chartData.widthEcg) >= 2) {
      chartData.widthEcg = wE;
      chartData.innerWEcg = wE - margins.left - margins.right;
      ecgY.range([chartData.innerHEcg, 0]);
      xTimeE.range([0, chartData.innerWEcg]);
      ecgSvg.attr("viewBox", `0 0 ${wE} ${ECG_HEIGHT}`);
      drawGrid(gridE, chartData.innerWEcg, chartData.innerHEcg);
    }

    const wA = el.abpChart.node().clientWidth || chartData.widthAbp;
    if (Math.abs(wA - chartData.widthAbp) >= 2) {
      chartData.widthAbp = wA;
      chartData.innerWAbp = wA - margins.left - margins.right;
      abpY.range([chartData.innerHAbp, 0]);
      xTimeA.range([0, chartData.innerWAbp]);
      abpSvg.attr("viewBox", `0 0 ${wA} ${ABP_HEIGHT}`);
      drawGrid(gridA, chartData.innerWAbp, chartData.innerHAbp);
    }

    drawAxes();
    positionMonitor();
    redrawECG(
      ecgBuf,
      head,
      bufLen,
      idxToXecg,
      ecgY,
      ecgPath,
      ecgIso,
      innerWEcg,
      innerHEcg
    );
    redrawABP(
      abpBuf,
      head,
      bufLen,
      idxToXabp,
      abpY,
      abpPath,
      abpIso,
      innerWAbp,
      innerHAbp
    );
  };
  window.addEventListener("resize", resize);

  // Animation loop
  const frame = (ts) => {
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
        const T = 60.0 / state.bpm;
        const phaseE = wrap01(tClock / T);
        const delay = (state.emdMs + state.pttMs) / 1000;
        const phaseA = wrap01((tClock - delay) / T);

        const ecg =
          ecgAtPhase(phaseE, state, getEcgModel()) +
          (Math.random() * 2 - 1) * 0.01;
        const abp = pressureAtPhase(phaseA, state);

        ecgBuf[head] = ecg;
        abpBuf[head] = abp;
        head = (head + 1) % bufLen;

        if (abp < beatMin) beatMin = abp;
        if (abp > beatMax) beatMax = abp;
        beatSum += abp;
        beatCount++;

        if (prevPhaseA !== null && phaseA < prevPhaseA) {
          measSys = Math.round(beatMax);
          measDia = Math.round(beatMin);
          measMap = Math.round(beatSum / Math.max(1, beatCount));
          updateMonitorUI(measSys, measDia, measMap, state);
          updateKpis();
          beatMin = 1e9;
          beatMax = -1e9;
          beatSum = 0;
          beatCount = 0;
        }
        prevPhaseA = phaseA;
      }
      acc -= toGen * step;
      redrawECG(
        ecgBuf,
        head,
        bufLen,
        idxToXecg,
        ecgY,
        ecgPath,
        ecgIso,
        innerWEcg,
        innerHEcg
      );
      redrawABP(
        abpBuf,
        head,
        bufLen,
        idxToXabp,
        abpY,
        abpPath,
        abpIso,
        innerWAbp,
        innerHAbp
      );
    }
  };
  d3.timer(frame);

  // Setup controls
  setupControls({
    el,
    state,
    setState,
    updateEcgModel,
    prefill,
    resetBuffers,
    redrawECG: () =>
      redrawECG(
        ecgBuf,
        head,
        bufLen,
        idxToXecg,
        ecgY,
        ecgPath,
        ecgIso,
        innerWEcg,
        innerHEcg
      ),
    redrawABP: () =>
      redrawABP(
        abpBuf,
        head,
        bufLen,
        idxToXabp,
        abpY,
        abpPath,
        abpIso,
        innerWAbp,
        innerHAbp
      ),
    refreshAbpScale,
    updateKpis,
    updateMonitorUI,
    drawAxes,
    positionMonitor,
  });

  // Initial setup
  positionMonitor();
  updateEcgModel(state);
  prefill();
  drawAxes();
  updateMonitorUI(measSys, measDia, measMap, state);
  updateKpis();
  redrawECG(
    ecgBuf,
    head,
    bufLen,
    idxToXecg,
    ecgY,
    ecgPath,
    ecgIso,
    innerWEcg,
    innerHEcg
  );
  redrawABP(
    abpBuf,
    head,
    bufLen,
    idxToXabp,
    abpY,
    abpPath,
    abpIso,
    innerWAbp,
    innerHAbp
  );
  el.toggle.textContent = "Pause";
});
