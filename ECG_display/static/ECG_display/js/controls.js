// src/ui/controls.js
import { clamp } from "./utils.js";

export const setupControls = ({
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
  on(el.bpm, "input", (e) => {
    state.bpm = +e.target.value;
    el.bpmVal.textContent = state.bpm;
    updateEcgModel(state);
    prefill();
    updateKpis();
  });

  on(el.dur, "input", (e) => {
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

  const updateAndPrefill = () => {
    updateEcgModel(state);
    prefill();
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
      updateAndPrefill();
    });
    on(el.prSeg, ev, (e) => {
      state.prSeg = +e.target.value;
      updateAndPrefill();
    });
    on(el.qrsDur, ev, (e) => {
      state.qrsDur = +e.target.value;
      updateAndPrefill();
    });
    on(el.stSeg, ev, (e) => {
      state.stSeg = +e.target.value;
      updateAndPrefill();
    });
    on(el.tDur, ev, (e) => {
      state.tDur = +e.target.value;
      updateAndPrefill();
    });
    on(el.tpDur, ev, (e) => {
      state.tpDur = +e.target.value;
      updateAndPrefill();
    });
    on(el.autoTP, ev, (e) => {
      state.autoTP = e.target.checked;
      updateAndPrefill();
    });

    on(el.prLvl, ev, (e) => {
      state.prLevel = +e.target.value;
      prefill();
    });
    on(el.stLvl, ev, (e) => {
      state.stLevel = +e.target.value;
      prefill();
    });
    on(el.tpLvl, ev, (e) => {
      state.tpLevel = +e.target.value;
      prefill();
    });
  });

  // ABP controls
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
    updateMonitorUI(measSys, measDia, measMap, state);
  });
  on(el.spo2N, "input", (e) => {
    state.spo2 = +e.target.value;
    syncSpO2UI();
    updateMonitorUI(measSys, measDia, measMap, state);
  });
  on(el.pi, "input", (e) => {
    state.pi = +e.target.value;
    syncPiUI();
    updateMonitorUI(measSys, measDia, measMap, state);
  });
  on(el.piN, "input", (e) => {
    state.pi = +e.target.value;
    syncPiUI();
    updateMonitorUI(measSys, measDia, measMap, state);
  });
  on(el.tof, "input", (e) => {
    state.tof = +e.target.value;
    syncTofUI();
    updateMonitorUI(measSys, measDia, measMap, state);
  });
  on(el.tofN, "input", (e) => {
    state.tof = +e.target.value;
    syncTofUI();
    updateMonitorUI(measSys, measDia, measMap, state);
  });
  on(el.bis, "input", (e) => {
    state.bis = +e.target.value;
    syncBisUI();
    updateMonitorUI(measSys, measDia, measMap, state);
  });
  on(el.bisN, "input", (e) => {
    state.bis = +e.target.value;
    syncBisUI();
    updateMonitorUI(measSys, measDia, measMap, state);
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
    updateMonitorUI(measSys, measDia, measMap, state);
  });

  on(el.toggle, "click", () => {
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
