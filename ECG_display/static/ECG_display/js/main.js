// src/main.js
import { setupElements } from "./dom.js";
import { initState, getState, setState } from "./state.js";
import { setupCharts, drawGrid } from "./ui/charts.js";
import { setupTraces, redrawECG, redrawABP } from "./ui/rendering.js";
import { setupMonitor } from "./ui/monitor.js";
import { updateEcgModel, getEcgModel, ecgModel } from "./models/ecgModel.js";
import { ecgBaselineAt } from "./models/ecgModel.js";
import { pressureAtPhase, resetFiltAbp } from "./models/abpModel.js";
import { clamp, wrap01, gaussWrapped } from "./utils.js";
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

  const ecgAtPhase = function (phase, state) {
    const m = ecgModel;
    const k = state.ecgAmp;
    let v = ecgBaselineAt(phase);
    v += k * state.pAmp * gaussWrapped(phase, m.muP, m.sP);
    v += k * state.qAmp * gaussWrapped(phase, m.muQ, m.sQ);
    v += k * state.rAmp * gaussWrapped(phase, m.muR, m.sR);
    v += k * state.sAmp * gaussWrapped(phase, m.muS, m.sS);
    v += k * state.tAmp * gaussWrapped(phase, m.muT, m.sT);
    return v;
  };
  // Setup traces and isolines
  const { ecgPath, abpPath, ecgIso, abpIso } = setupTraces(traceE, traceA);

  // Setup monitor overlay
  const {
    updateMonitor: updateMonitorUI,
    positionMonitor,
    tofCountFromRatio,
  } = setupMonitor(gA, innerWAbp);

  // setuo controls
  const setupControls = ({
    el,
    state,
    setState,
    updateEcgModel,
    prefill,
    resetBuffers,
    redrawECG,
    redrawABP,
    refreshAbpScale,
    updateKpis,
    updateMonitorUI,
    drawAxes,
    positionMonitor,
  }) => {
    const { $, on } = window; // assuming these are globally available or imported

    const syncSysUI = () => {
      el.sysVal.textContent = state.sys;
      if (el.sys) el.sys.value = clamp(state.sys, 80, 220);
      if (el.sysN) el.sysN.value = state.sys;
    };

    const syncDiaUI = () => {
      el.diaVal.textContent = state.dia;
      if (el.dia) el.dia.value = clamp(state.dia, 40, 120);
      if (el.diaN) el.diaN.value = state.dia;
    };

    const syncSpO2UI = () => {
      el.spo2Val.textContent = state.spo2;
      if (el.spo2) el.spo2.value = clamp(state.spo2, 50, 100);
      if (el.spo2N) el.spo2N.value = state.spo2;
    };

    const syncPiUI = () => {
      el.piVal.textContent = (+state.pi).toFixed(1);
      if (el.pi) el.pi.value = clamp(state.pi, 0, 20);
      if (el.piN) el.piN.value = state.pi;
    };

    const syncTofUI = () => {
      el.tofVal.textContent = Math.round(state.tof);
      if (el.tof) el.tof.value = clamp(state.tof, 0, 100);
      if (el.tofN) el.tofN.value = state.tof;
    };

    const syncBisUI = () => {
      el.bisVal.textContent = Math.round(state.bis);
      if (el.bis) el.bis.value = clamp(state.bis, 0, 100);
      if (el.bisN) el.bisN.value = state.bis;
    };

    const afterSysDiaChange = () => {
      state.sys = Math.max(state.dia + 1, state.sys); // enforce sys > dia
      measSys = Math.round(state.sys);
      measDia = Math.round(state.dia);
      measMap = Math.round((measSys + 2 * measDia) / 3);
      updateMonitorUI(measSys, measDia, measMap, state);
      updateKpis();
      refreshAbpScale();
      prefill();
      redrawABP();
    };
    // === Bind controls ===
    el.bpm.addEventListener("input", (e) => {
      state.bpm = +e.target.value;
      el.bpmVal.textContent = state.bpm;
      updateEcgModel(state);
      prefill();
      updateKpis();
    });

    el.dur.addEventListener("input", (e) => {
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

    el.fs.addEventListener("change", (e) => {
      state.fs = +e.target.value;
      resetBuffers();
      prefill();
      redrawECG();
      redrawABP();
    });

    el.ecgAmp.addEventListener("input", (e) => {
      state.ecgAmp = +e.target.value;
      el.ecgAmpVal.textContent = state.ecgAmp.toFixed(2);
    });

    const updateAndPrefill = () => {
      updateEcgModel(state);
      prefill();
    };

    ["input", "change"].forEach((ev) => {
      el.pAmp.addEventListener(ev, (e) => {
        state.pAmp = +e.target.value;
      });
      el.qAmp.addEventListener(ev, (e) => {
        state.qAmp = +e.target.value;
      });
      el.rAmp.addEventListener(ev, (e) => {
        state.rAmp = +e.target.value;
      });
      el.sAmp.addEventListener(ev, (e) => {
        state.sAmp = +e.target.value;
      });
      el.tAmp.addEventListener(ev, (e) => {
        state.tAmp = +e.target.value;
      });

      el.pDur.addEventListener(ev, (e) => {
        state.pDur = +e.target.value;
        updateAndPrefill();
      });
      el.prSeg.addEventListener(ev, (e) => {
        state.prSeg = +e.target.value;
        updateAndPrefill();
      });
      el.qrsDur.addEventListener(ev, (e) => {
        state.qrsDur = +e.target.value;
        updateAndPrefill();
      });
      el.stSeg.addEventListener(ev, (e) => {
        state.stSeg = +e.target.value;
        updateAndPrefill();
      });
      el.tDur.addEventListener(ev, (e) => {
        state.tDur = +e.target.value;
        updateAndPrefill();
      });
      el.tpDur.addEventListener(ev, (e) => {
        state.tpDur = +e.target.value;
        updateAndPrefill();
      });
      el.autoTP.addEventListener(ev, (e) => {
        state.autoTP = e.target.checked;
        updateAndPrefill();
      });

      el.prLvl.addEventListener(ev, (e) => {
        state.prLevel = +e.target.value;
        prefill();
      });
      el.stLvl.addEventListener(ev, (e) => {
        state.stLevel = +e.target.value;
        prefill();
      });
      el.tpLvl.addEventListener(ev, (e) => {
        state.tpLevel = +e.target.value;
        prefill();
      });
    });

    // ABP controls
    el.sys.addEventListener("input", (e) => {
      state.sys = +e.target.value;
      syncSysUI();
      afterSysDiaChange();
    });
    el.sysN.addEventListener("input", (e) => {
      state.sys = +e.target.value;
      syncSysUI();
      afterSysDiaChange();
    });
    el.dia.addEventListener("input", (e) => {
      state.dia = +e.target.value;
      syncDiaUI();
      afterSysDiaChange();
    });
    el.diaN.addEventListener("input", (e) => {
      state.dia = +e.target.value;
      syncDiaUI();
      afterSysDiaChange();
    });

    el.spo2.addEventListener("input", (e) => {
      state.spo2 = +e.target.value;
      syncSpO2UI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });
    el.spo2N.addEventListener("input", (e) => {
      state.spo2 = +e.target.value;
      syncSpO2UI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });
    el.pi.addEventListener("input", (e) => {
      state.pi = +e.target.value;
      syncPiUI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });
    el.piN.addEventListener("input", (e) => {
      state.pi = +e.target.value;
      syncPiUI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });
    el.tof.addEventListener("input", (e) => {
      state.tof = +e.target.value;
      syncTofUI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });
    el.tofN.addEventListener("input", (e) => {
      state.tof = +e.target.value;
      syncTofUI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });
    el.bis.addEventListener("input", (e) => {
      state.bis = +e.target.value;
      syncBisUI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });
    el.bisN.addEventListener("input", (e) => {
      state.bis = +e.target.value;
      syncBisUI();
      updateMonitorUI(measSys, measDia, measMap, state);
    });

    el.notchPos.addEventListener("input", (e) => {
      state.notchPos = +e.target.value;
      el.notchPosVal.textContent = state.notchPos.toFixed(2);
    });

    el.notchDepth.addEventListener("input", (e) => {
      state.notchDepth = +e.target.value;
      el.notchDepthVal.textContent = state.notchDepth.toFixed(2);
    });

    el.damp.addEventListener("input", (e) => {
      state.damping = +e.target.value;
      el.dampVal.textContent = state.damping.toFixed(2);
    });

    el.aug.addEventListener("input", (e) => {
      state.aug = +e.target.value;
      el.augVal.textContent = state.aug.toFixed(2);
    });

    el.tau.addEventListener("input", (e) => {
      state.tauRel = +e.target.value;
      el.tauVal.textContent = state.tauRel.toFixed(2);
    });

    el.emd.addEventListener("input", (e) => {
      state.emdMs = +e.target.value;
      el.emdVal.textContent = state.emdMs;
      updateKpis();
    });

    el.ptt.addEventListener("input", (e) => {
      state.pttMs = +e.target.value;
      el.pttVal.textContent = state.pttMs;
      updateKpis();
    });

    el.regen.addEventListener("click", () => {
      tClock = 0;
      acc = 0;
      resetBuffers();
      prefill();
      drawAxes();
      redrawECG();
      redrawABP();
      updateMonitorUI(measSys, measDia, measMap, state);
    });

    el.toggle.addEventListener("click", () => {
      state.playing = !state.playing;
      el.toggle.textContent = state.playing ? "Pause" : "Play";
      lastTick = null;
    });

    // Toggle controls visibility
    const toggleBtn = document.getElementById("toggleControls");
    const controls = document.querySelector(".controls");
    const settingsTitle = document.getElementById("settingsTitle");

    if (toggleBtn && controls && settingsTitle) {
      toggleBtn.addEventListener("click", () => {
        const content = Array.from(controls.children).filter(
          (child) => child !== toggleBtn && child !== settingsTitle
        );
        const isHidden = content[0].style.display === "none";

        content.forEach((el) => {
          el.style.display = isHidden ? "" : "none";
        });
        toggleBtn.textContent = isHidden ? "−" : "+";
      });
    }
  };

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
