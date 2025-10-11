// main.js
// Використовує глобальний d3 з <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
import { setupElements } from "./dom.js?v=dev";
import { initState, getState, setState } from "./state.js?v=dev";
import { setupCharts, drawGrid } from "./ui/charts.js?v=dev";
import { setupTraces, redrawECG, redrawABP } from "./ui/rendering.js?v=dev";
import { setupMonitor } from "./ui/monitor.js?v=dev";
import { updateEcgModel, getEcgModel, ecgModel, ecgBaselineAt } from "./models/ecgModel.js?v=dev";
import { pressureAtPhase, resetFiltAbp, setAbpFs, setVfTauSec } from "./models/abpModel.js?v=dev";
import { clamp, wrap01, gaussWrapped } from "./utils.js?v=dev";

// === VF randomness state (глобально в main.js) ===
let vfPrevPhase = null;   // щоб ловити початок нового "удару"
let vfA = 1, vfF = 1, vfSkew = 1; // повільний random-walk для ампл./част./скісу
let vfR1 = Math.random() * Math.PI * 2, vfR2 = Math.random() * Math.PI * 2; // випадк. фази AM/FM
let vfNoise = 0;          // low-pass шум (вузькосмуговий)
let vfSpike = 0;          // "хвіст" випадкового шпильки

// === AVB-III timekeeper ===
let avb_lastPhase = null;   // попередня "серцева" фаза, щоб по ній оцінювати dt
let avb_t = 0;              // накопичений "абсолютний" час у секундах


function vfOnBeat(kind) {
  // крок рандом-волку на початку кожного "удару"
  vfA   = Math.min(2.0, Math.max(0.5, vfA   + (Math.random()*2 - 1) * 0.25));
  vfF   = Math.min(kind === 'coarse' ? 1.40 : 1.70,
           Math.max(kind === 'coarse' ? 0.70 : 0.90, vfF + (Math.random()*2 - 1) * (kind === 'coarse' ? 0.18 : 0.25)));
  vfSkew= Math.min(2.2, Math.max(0.8, vfSkew + (Math.random()*2 - 1) * 0.35));

  // нові фази для повільної AM/FM
  vfR1 = Math.random()*Math.PI*2;
  vfR2 = Math.random()*Math.PI*2;

  // іноді даємо "скол/шпильку"
  if (Math.random() < (kind === 'coarse' ? 0.12 : 0.08)) {
    vfSpike = (kind === 'coarse' ? 0.6 : 0.4);
  }
}

// Анімаційні змінні
let tClock = 0, lastTick = null, acc = 0;

// === AF (atrial fibrillation) randomness state ===
let afPrevPhase = null;     // щоб ловити початок нового "серц. циклу"
let afC1 = 8, afC2 = 10, afC3 = 12;  // кількість "f-хвиль" на один серц. цикл
let afR1 = 0, afR2 = 0, afR3 = 0;    // випадкові фази f-хвиль
let afEnv = 1.0;                     // повільна ампл. огинаюча f-хвиль
let afRshift = 0.0;                  // мікро-зсув позиції QRS усередині циклу (вигляд «нерівномірності»)

function afReset() {
  afPrevPhase = null;
  afEnv = 1.0;
  afRshift = 0.0;
  afR1 = Math.random() * 2 * Math.PI;
  afR2 = Math.random() * 2 * Math.PI;
  afR3 = Math.random() * 2 * Math.PI;
}



document.addEventListener("DOMContentLoaded", () => {
  const el = setupElements();
  initState(el);
  const state = getState();
  setAbpFs(state.fs);
  setVfTauSec(4.0);

  const initialDefaults = {
    ...state,
    scenario: "baseline",
    ecgMode: "sinus",
    abpMode: "default",
  };

  const SCENARIOS = {
    baseline: { label: "Синусовий ритм", params: initialDefaults },
    vf: {
      label: "Фібриляція шлуночків",
      params: {
        scenario: "vf",
        ecgMode: "vf",
        abpMode: "default",
        bpm: 18, duration: 10, fs: 500, ecgAmp: 1.3,
        pAmp: 0, pDur: 60, qAmp: -0.1, qrsDur: 50, rAmp: 0.25, sAmp: -0.25,
        tAmp: 0, tDur: 60, prSeg: 0, stSeg: 0, tpDur: 120, autoTP: true,
        prLevel: 0, stLevel: 0, tpLevel: 0,
        sys: 40, dia: 30, spo2: 0, pi: 1.2, tof: 5, bis: 10,
        notchPos: 0.36, notchDepth: 0.15, damping: 0.1, aug: 0.05, tauRel: 0.35,
        emdMs: 120, pttMs: 80, playing: true,
      },
    },
    mi_stemi: {
  label: "ІМ з підйомом ST (інферіор)",
  params: {
    scenario: "mi_stemi",
    ecgMode: "sinus",
    abpMode: "default",

    // Ритм і «вікно»
    bpm: 96,           // помірна тахікардія при болю/стресі
    duration: 10,
    fs: 500,

    // Амплітуди/тривалості хвиль
    ecgAmp: 1.0,
    pAmp: 0.12,
    pDur: 110,
    prSeg: 160,

    // QRS: трохи зменшений R і виразніший Q
    qAmp: -0.35,       // патологічна Q (≈ >0.03 мВ·с еквівалент)
    qrsDur: 100,
    rAmp: 0.75,
    sAmp: -0.20,

    // ST та T — ключ до STEMI
    stSeg: 200,        // подовжений сегмент ST
    stLevel: 0.35,     // +0.35 мВ ≈ 3.5 мм підйом при 10 мм/мВ
    tAmp: 0.60,        // «гіперакутна» T
    tDur: 200,

    // TP авто
    tpDur: 220,
    autoTP: true,

    // Базові рівні
    prLevel: 0,
    tpLevel: 0,

    // Гемодинаміка (умовна)
    sys: 200,
    dia: 60,
    spo2: 93,
    pi: 1.5,
    tof: 90,
    bis: 60,

    // ABP форма
    notchPos: 0.36,
    notchDepth: 0.18,
    damping: 0.28,
    aug: 0.25,
    tauRel: 0.40,

    // Затримки
    emdMs: 120,
    pttMs: 80,
    playing: true,
  },
},

mi_nstemi: {
  label: "Ішемія / NSTEMI (ST↓, T інверсія)",
  params: {
    scenario: "mi_nstemi",
    ecgMode: "sinus",
    abpMode: "default",

    bpm: 88,
    duration: 10,
    fs: 500,

    ecgAmp: 1.0,
    pAmp: 0.12,
    pDur: 110,
    prSeg: 160,

    // QRS без патологічної Q
    qAmp: -0.10,
    qrsDur: 90,
    rAmp: 0.95,
    sAmp: -0.25,

    // ST депресія і інверсія T
    stSeg: 160,
    stLevel: -0.20,    // −0.20 мВ ≈ 2 мм депресії
    tAmp: -0.40,       // інверсія T
    tDur: 180,

    tpDur: 240,
    autoTP: true,

    prLevel: 0,
    tpLevel: 0,

    // Гемодинаміка (легша, ніж при STEMI)
    sys: 110,
    dia: 70,
    spo2: 96,
    pi: 2.4,
    tof: 90,
    bis: 60,

    notchPos: 0.36,
    notchDepth: 0.20,
    damping: 0.25,
    aug: 0.30,
    tauRel: 0.35,

    emdMs: 120,
    pttMs: 80,
    playing: true,
  },
},


    af: {
  label: "Фібриляція передсердь",
  params: {
    scenario: "af",
    ecgMode: "af",
    abpMode: "default",
    // середня шлуночкова ЧСС (керує загальним «годинником» і АТ)
    bpm: 110,             // можеш крутити повзунком 90..150
    duration: 10,
    fs: 500,

    // амплітуди/тривалості — «звичні», але без P
    ecgAmp: 1.0,
    pAmp: 0.0,            // немає P
    pDur: 90,
    prSeg: 0,
    qAmp: -0.12,
    qrsDur: 90,
    rAmp: 1.0,
    sAmp: -0.25,
    stSeg: 120,
    tAmp: 0.30,
    tDur: 180,
    tpDur: 240,
    autoTP: true,

    prLevel: 0,
    stLevel: 0,
    tpLevel: 0,

    // Монітор/АТ — типові значення
    sys: 120,
    dia: 70,
    spo2: 98,
    pi: 3.2,
    tof: 90,
    bis: 60,

    notchPos: 0.36,
    notchDepth: 0.20,
    damping: 0.25,
    aug: 0.30,
    tauRel: 0.35,
    emdMs: 120,
    pttMs: 80,
    playing: true,
  },
},

    avb3: {
  label: "Повна AV-блокада (III)",
  params: {
    scenario: "avb3",
    ecgMode: "avb3",
    // ВАЖЛИВО: bpm ставимо = ШЛУНОЧКОВІЙ ЧСС, щоб ABP співпав з QRS
    bpm: 26,
    avbAtrialBpm: 78,
    avbVentricularBpm: 26,

    // решта — звичні дефолти
    duration: 10, fs: 500, ecgAmp: 1.0,
    pAmp: 0.12, pDur: 110,
    qAmp: -0.12, qrsDur: 110, rAmp: 0.9, sAmp: -0.20,
    tAmp: 0.30, tDur: 180,
    prSeg: 0, stSeg: 0, tpDur: 280, autoTP: true,
    prLevel: 0, stLevel: 0, tpLevel: 0,
    sys: 120, dia: 70, spo2: 98, pi: 3.2, tof: 90, bis: 60,
    notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30,
    tauRel: 0.35, emdMs: 120, pttMs: 80,
    playing: true,
  },
},

    asystole: {
      label: "Асистолія",
      params: {
        scenario: "asystole",
        ecgMode: "flatline",
        abpMode: "flatline",
        bpm: 40, duration: 10, fs: 500, ecgAmp: 0.5,
        pAmp: 0, pDur: 60, qAmp: 0, qrsDur: 40, rAmp: 0, sAmp: 0, tAmp: 0,
        prSeg: 0, stSeg: 0, tDur: 60, tpDur: 400, autoTP: true,
        prLevel: 0, stLevel: 0, tpLevel: 0,
        sys: 30, dia: 20, spo2: 50, pi: 0.5, tof: 0, bis: 0,
        notchPos: 0.36, notchDepth: 0.1, damping: 0.4, aug: 0, tauRel: 0.4,
        emdMs: 120, pttMs: 80, playing: true,
      },
    },
  };

  // ===== Графіки / осі
  const chart = setupCharts(el, state);
  const {
    ecgY, abpY, xTimeE, xTimeA,
    gA, ecgSvg, abpSvg,
    gridE, axesE, traceE, gridA, axesA, traceA,
    innerWEcg, innerHEcg, innerWAbp, innerHAbp,
    ECG_HEIGHT, ABP_HEIGHT, margins,
  } = chart;

    
  const drawAxes = () => {
    axesE.selectAll("*").remove();
    axesA.selectAll("*").remove();

    const axEleft = d3.axisLeft(ecgY).tickValues([-2, -1, 0, 1, 2]);
    const axEbottom = d3.axisBottom(xTimeE).ticks(Math.max(2, Math.min(10, Math.round(state.duration))));
    axesE.append("g").attr("class", "axis").call(axEleft);
    axesE.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHEcg})`).call(axEbottom);
    axesE.append("text").attr("class", "label").attr("x", innerWEcg).attr("y", innerHEcg + 20)
      .attr("text-anchor", "end").text("час, с (останнє −T…0)");
    axesE.append("text").attr("class", "label").attr("x", -8).attr("y", 10)
      .attr("text-anchor", "end").text("мВ");

    const axAleft = d3.axisLeft(abpY).ticks(5);
    const axAbottom = d3.axisBottom(xTimeA).ticks(Math.max(2, Math.min(10, Math.round(state.duration))));
    axesA.append("g").attr("class", "axis").call(axAleft);
    axesA.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHAbp})`).call(axAbottom);
    axesA.append("text").attr("class", "label").attr("x", innerWAbp).attr("y", innerHAbp + 20)
      .attr("text-anchor", "end").text("час, с (останнє −T…0)");
    axesA.append("text").attr("class", "label").attr("x", -8).attr("y", 10)
      .attr("text-anchor", "end").text("мм рт. ст.");
  };

  drawGrid(gridE, innerWEcg, innerHEcg);
  drawGrid(gridA, innerWAbp, innerHAbp);
  drawAxes();

  // ===== Трейси
  const { ecgPath, abpPath, ecgIso, abpIso } = setupTraces(traceE, traceA);

  // ===== Монітор
  const { updateMonitor: updateMonitorUI, positionMonitor } = setupMonitor(gA, innerWAbp);

// t — час у секундах (безперервний); vfType: "coarse"|"fine"
const ecgVFWave = (t, state) => {
  const kind = state.vfType || "coarse";
  const base = state.tpLevel || 0;

  // базова частота та амплітуда для двох типів
  const f0   = (kind === "coarse") ? 4.5 : 11.0;     // Гц
  const a0   = (kind === "coarse") ? 1.05 : 0.35;    // масштаб амплітуди
  const amp  = (state.ecgAmp || 1) * a0 * vfEnv;

  // повільна частотна модуляція (щоб хвиля "жила")
  const fm = 1 + 0.25 * Math.sin(2*Math.PI*0.20*t) + 0.10 * Math.sin(2*Math.PI*0.41*t + 0.7);
  const f  = f0 * fm;

  // кілька гармонік з фазовими зсувами
  let x =
    0.95 * Math.sin(2*Math.PI * (f)   * t) +
    0.55 * Math.sin(2*Math.PI * (f*1.6) * t + 0.8) +
    0.35 * Math.sin(2*Math.PI * (f*2.3) * t + 1.6);

  // нелінійне "заламування" для крутих фронтів
  x = Math.tanh((kind === "coarse" ? 1.9 : 1.5) * x);

  // випадковий дрібний шум
  const noise = (Math.random() * 2 - 1) * (state.vfNoise ?? 0.10);

  return base + amp * x + noise;
};



const ecgAtPhase = (phase, state) => {
  if (state.ecgMode === "af") {
  // Якщо почався новий цикл (фаза «перекотилась»), оновлюємо випадкові параметри
  if (afPrevPhase !== null && phase < afPrevPhase) {
    // Скільки f-хвиль на один серцевий цикл (залежить від Т=60/bpm → 6–11 Гц в секундах)
    const T = 60.0 / Math.max(30, state.bpm || 60); // страхувальний мінімум
    const f1 = 6 + Math.random() * 5;   // 6..11 Гц
    const f2 = 6 + Math.random() * 5;
    const f3 = 6 + Math.random() * 5;
    afC1 = f1 * T;                      // перетворюємо Гц у "цикли на удар"
    afC2 = f2 * T;
    afC3 = f3 * T;

    // повільна зміна амплітуди «f-waves»
    afEnv = 0.8 + Math.random() * 0.5;  // 0.8..1.3
    // невеличкий випадковий зсув QRS у фазі (імітація «нерівності»)
    afRshift = (Math.random() - 0.5) * 0.05; // ±0.05 частки циклу

    // випадкові фази компонент
    afR1 = Math.random() * 2 * Math.PI;
    afR2 = Math.random() * 2 * Math.PI;
    afR3 = Math.random() * 2 * Math.PI;
  }
  afPrevPhase = phase;

  const base = state.tpLevel || 0;
  const k    = state.ecgAmp || 1;

  // f-waves на ізолінії (дрібні, але помітні хвилі)
  const phi = phase * 2 * Math.PI;
  const fWaves = (
    1.00 * Math.sin(afC1 * phi + afR1) +
    0.65 * Math.sin(afC2 * phi + afR2) +
    0.45 * Math.sin(afC3 * phi + afR3)
  );

  // Робимо baseline з f-хвилями малої амплітуди (0.08–0.18 мВ * ecgAmp)
  let v = base + k * (0.12 * afEnv) * fWaves;

  // QRS + T як звичайно, але БЕЗ P (у AF P-хвиль нема)
  const m = ecgModel;
  if (m) {
    // зсунутий центр R/S/Q, щоби злегка «гуляла» позиція комплексу
    const shift = afRshift;

    v += k * (state.qAmp ?? -0.12) * gaussWrapped(phase, (m.muQ + shift) % 1, m.sQ);
    v += k * (state.rAmp ?? 1.00)  * gaussWrapped(phase, (m.muR + shift) % 1, m.sR);
    v += k * (state.sAmp ?? -0.25) * gaussWrapped(phase, (m.muS + shift) % 1, m.sS);
    v += k * (state.tAmp ?? 0.30)  * gaussWrapped(phase, m.muT, m.sT);
  }

  // дрібний шум (щоб не було надто «цифрово»)
  v += (Math.random() * 2 - 1) * 0.01;

  return v;
}

  if (state.ecgMode === "flatline") {
    const baseline = state.tpLevel || 0;
    return baseline + (Math.random() * 2 - 1) * 0.02;
  }

  if (state.ecgMode === "avb3") {
  // 1) оцінюємо dt з "загальної" фази, щоб мати абсолютний час
  const Tref = 60.0 / (state.bpm || 60); // state.bpm тут візьми = ШЛУНОЧКОВА ЧСС!
  if (avb_lastPhase == null) {
    avb_lastPhase = phase;
  } else {
    let dphi = phase - avb_lastPhase;
    if (dphi < -0.5) dphi += 1;          // враховуємо оберт по колу
    if (dphi > 0) avb_t += dphi * Tref;  // сек
    avb_lastPhase = phase;
  }

  // 2) окремі ритми
  const aBpm = clamp(state.avbAtrialBpm ?? 75, 60, 90);   // передсердя
  const vBpm = clamp(state.avbVentricularBpm ?? 26, 20, 30); // шлуночки
  const Ta = 60 / aBpm, Tv = 60 / vBpm;

  const pha = wrap01(avb_t / Ta);  // фаза P-хвилі
  const phv = wrap01(avb_t / Tv);  // фаза шлуночкового комплексу

  const base = state.tpLevel || 0;
  const k    = state.ecgAmp || 1;

  // --- P-хвиля (тільки передсердя) ---
  const pAmp  = state.pAmp  ?? 0.12;
  const pDur  = Math.max(40, state.pDur  ?? 110);   // мс
  const sP    = ((pDur/1000) / Ta) / 5;             // sigma як частка циклу
  const muP   = 0.18;                                // позиція всередині передсердного циклу

  // --- Шлуночковий комплекс (QRS + T) на власному циклі ---
  const qAmp  = state.qAmp  ?? -0.12;
  const rAmp  = state.rAmp  ?? 0.9;
  const sAmp  = state.sAmp  ?? -0.20;
  const tAmp  = state.tAmp  ?? 0.30;

  const qrsDur = Math.max(60, state.qrsDur ?? 110); // мс, робимо трошки ширше — «escape»-ритм
  const fQRS   = (qrsDur/1000) / Tv;
  const muR    = 0.02;                               // R на початку шлуночкового циклу
  const muQ    = wrap01(muR - 0.25 * fQRS);
  const muS    = wrap01(muR + 0.25 * fQRS);
  const sQ     = Math.max(1e-3, fQRS * 0.12);
  const sR     = Math.max(1e-3, fQRS * 0.16);
  const sS     = Math.max(1e-3, fQRS * 0.12);

  const tDur   = Math.max(120, state.tDur ?? 180);
  const sT     = ((tDur/1000) / Tv) / 5;
  const muT    = wrap01(muR + 0.38);                 // T після QRS

  // --- сумарний сигнал ---
  let v = base;
  v += k * pAmp * gaussWrapped(pha, muP, sP);        // незалежні P
  v += k * qAmp * gaussWrapped(phv, muQ, sQ);
  v += k * rAmp * gaussWrapped(phv, muR, sR);
  v += k * sAmp * gaussWrapped(phv, muS, sS);
  v += k * tAmp * gaussWrapped(phv, muT, sT);

  // дрібний шум, щоб не було занадто «чисто»
  v += (Math.random() * 2 - 1) * 0.01;
  return v;
}


  if (state.ecgMode === "vf") {
  const kind = state.vfType === "fine" ? "fine" : "coarse";

  // Детекція нового "удару" (фаза скинулась) — робимо random-walk кроки
  if (vfPrevPhase !== null && phase < vfPrevPhase) {
    vfOnBeat(kind);
  }
  vfPrevPhase = phase;

  const base = state.tpLevel || 0;
  const A0   = state.ecgAmp || 1;

  // амплітуда з повільним рандом-волком
  const A = A0 * (kind === "coarse" ? 1.2 : 0.7) * (0.9 + 0.2 * vfA);

  const phi  = phase * 2 * Math.PI;

  // домінантна частота з повільним рандом-волком
  const f0   = (state.vfDominant ?? (kind === "coarse" ? 7.5 : 14.0)) * (1.0 + 0.25 * (vfF - 1.0));

  // повільні AM/FM з випадковими фазами
  const am = 0.75 + 0.25 * Math.sin(0.40 * phi + vfR1) + 0.10 * Math.sin(0.13 * phi + vfR2);
  const fm = 1.00 + 0.22 * Math.sin(0.60 * phi + vfR1) + 0.09 * Math.sin(0.22 * phi + vfR2);

  // основа (вузькосмуговий шум навколо f0)
  const th = phi * f0 * fm; // локальна фаза
  let x = Math.sin(th)
        + 0.35 * Math.sin(2 * th + 0.8)
        + 0.18 * Math.sin(3 * th + 1.6);

  // асиметрія/«рваність» схилів (нелінійність)
  x = Math.tanh((kind === "coarse" ? 1.6 : 1.3) * vfSkew * x);

  // low-pass шум (більш "природний", ніж чистий білий)
  vfNoise = 0.95 * vfNoise + 0.05 * (Math.random() * 2 - 1);

  // хвіст шпильки повільно затухає
  vfSpike *= 0.86;
  const spikes = vfSpike * (Math.random() * 2 - 1);

  return base
       + A * am * x
       + (kind === "coarse" ? 0.05 : 0.08) * vfNoise   // дрібна випадковість
       + (kind === "coarse" ? 0.20 : 0.12) * spikes;   // зрідка — "сколи"
}


  // --- синусовий режим
  const m = ecgModel;
  // якщо модель ще не оновлена — повертаємо ізолінію (жодних піків)
  if (!m) return ecgBaselineAt(phase, state) ?? (state.tpLevel || 0);

  const k = state.ecgAmp;
  let v = ecgBaselineAt(phase, state);
  v += k * state.pAmp * gaussWrapped(phase, m.muP, m.sP);
  v += k * state.qAmp * gaussWrapped(phase, m.muQ, m.sQ);
  v += k * state.rAmp * gaussWrapped(phase, m.muR, m.sR);
  v += k * state.sAmp * gaussWrapped(phase, m.muS, m.sS);
  v += k * state.tAmp * gaussWrapped(phase, m.muT, m.sT);
  return v;
};


  // ===== Буфери
  let bufLen = Math.max(10, Math.round(state.duration * state.fs));
  let ecgBuf = new Float32Array(bufLen).fill(0);
  let abpBuf = new Float32Array(bufLen).fill(state.dia);
  let head = 0;
  window.__ABP_getBuffer = () => ({ buf: abpBuf, head, len: bufLen });



  const resetBuffers = () => {
    bufLen = Math.max(10, Math.round(state.duration * state.fs));
    ecgBuf = new Float32Array(bufLen).fill(0);
    abpBuf = new Float32Array(bufLen).fill(state.dia);
    head = 0;
  };

  const idxToXecg = (i, n) => (i / Math.max(1, n - 1)) * innerWEcg;
  const idxToXabp = (i, n) => (i / Math.max(1, n - 1)) * innerWAbp;

  // ===== KPI / виміри
  let prevPhaseA = null;
  let beatMin = 1e9, beatMax = -1e9, beatSum = 0, beatCount = 0;
  let measSys = state.sys, measDia = state.dia, measMap = Math.round((state.sys + 2 * state.dia) / 3);


  
  const updateKpis = () => {
    el.hrKpi.textContent = Math.round(state.bpm);
    el.bpKpi.textContent = `${measSys}/${measDia}`;
    el.mapKpi.textContent = measMap;
    el.emdKpi.textContent = Math.round(state.emdMs);
    el.pttKpi.textContent = Math.round(state.pttMs);
    el.warn.textContent = state.sys <= state.dia ? " | САТ≤ДАТ: крива змодельована зі САТ>ДАТ" : "";
  };

  const refreshAbpScale = () => {
    abpY.domain([0, Math.max(40, Math.max(state.sys, state.dia)) + 20]);
    drawGrid(gridA, innerWAbp, innerHAbp);
    drawAxes();
    positionMonitor();
    redrawABP(abpBuf, head, bufLen, idxToXabp, abpY, abpPath, abpIso, innerWAbp, innerHAbp);
  };

  // ===== Преповнення буфера
  const prefill = () => {
    const step = 1 / state.fs;
    let t = -state.duration;

    const startAbp = state.scenario === "vf"
      ? Math.round((state.sys + 2 * state.dia) / 3)
      : state.dia;
    resetFiltAbp(startAbp);

    prevPhaseA = null; beatMin = 1e9; beatMax = -1e9; beatSum = 0; beatCount = 0;

    // reset VF randomness state
vfPrevPhase = null;
vfA = 1; vfF = 1; vfSkew = 1; vfNoise = 0; vfSpike = 0;
vfR1 = Math.random()*Math.PI*2;
vfR2 = Math.random()*Math.PI*2;
// reset AVB time
avb_lastPhase = null;
avb_t = 0;
// reset AF
afReset();



    for (let i = 0; i < bufLen; i++) {
      const T = 60.0 / state.bpm;
      const phaseE = wrap01(t / T);
      const delay = (state.emdMs + state.pttMs) / 1000;
      const phaseA = wrap01((t - delay) / T);

      const ecg = ecgAtPhase(phaseE, state, getEcgModel()) + (Math.random() * 2 - 1) * 0.01;
      const abp = pressureAtPhase(phaseA, state);

      ecgBuf[head] = ecg;
      abpBuf[head] = abp;
      head = (head + 1) % bufLen;

      if (abp < beatMin) beatMin = abp;
      if (abp > beatMax) beatMax = abp;
      beatSum += abp; beatCount++;

      if (prevPhaseA !== null && phaseA < prevPhaseA) {
        measSys = Math.round(beatMax);
        measDia = Math.round(beatMin);
        measMap = Math.round(beatSum / Math.max(1, beatCount));
        updateMonitorUI(measSys, measDia, measMap, state);
        updateKpis();

        window.dispatchEvent(new CustomEvent('abp-beat', {
          detail: { t: performance.now() / 1000, T: 60.0 / state.bpm }
        }));


        beatMin = 1e9; beatMax = -1e9; beatSum = 0; beatCount = 0;
      }
      prevPhaseA = phaseA;
      t += step;
    }
    head = 0;
  };

  const redrawEcgNow = () => redrawECG(ecgBuf, head, bufLen, idxToXecg, ecgY, ecgPath, ecgIso, innerWEcg, innerHEcg);
  const redrawAbpNow = () => redrawABP(abpBuf, head, bufLen, idxToXabp, abpY, abpPath, abpIso, innerWAbp, innerHAbp);

  // ===== Контроли
  const setupControls = () => {
    const syncSysUI = () => { el.sysVal.textContent = state.sys; if (el.sys) el.sys.value = clamp(state.sys, 80, 220); if (el.sysN) el.sysN.value = state.sys; };
    const syncDiaUI = () => { el.diaVal.textContent = state.dia; if (el.dia) el.dia.value = clamp(state.dia, 40, 120); if (el.diaN) el.diaN.value = state.dia; };
    const syncSpO2UI = () => { el.spo2Val.textContent = state.spo2; if (el.spo2) el.spo2.value = clamp(state.spo2, 50, 100); if (el.spo2N) el.spo2N.value = state.spo2; };
    const syncPiUI = () => { el.piVal.textContent = (+state.pi).toFixed(1); if (el.pi) el.pi.value = clamp(state.pi, 0, 20); if (el.piN) el.piN.value = state.pi; };
    const syncTofUI = () => { el.tofVal.textContent = Math.round(state.tof); if (el.tof) el.tof.value = clamp(state.tof, 0, 100); if (el.tofN) el.tofN.value = state.tof; };
    const syncBisUI = () => { el.bisVal.textContent = Math.round(state.bis); if (el.bis) el.bis.value = clamp(state.bis, 0, 100); if (el.bisN) el.bisN.value = state.bis; };

    const afterSysDiaChange = () => {
      state.sys = Math.max(state.dia + 1, state.sys);
      measSys = Math.round(state.sys);
      measDia = Math.round(state.dia);
      measMap = Math.round((measSys + 2 * measDia) / 3);
      updateMonitorUI(measSys, measDia, measMap, state);
      updateKpis();
      window.dispatchEvent(new CustomEvent('abp-beat', {
  detail: { t: performance.now() / 1000, T: 60.0 / state.bpm }
}));


      refreshAbpScale(); prefill(); redrawAbpNow();
    };

    // Прив’язки
    el.bpm.addEventListener("input", (e) => { state.bpm = +e.target.value; el.bpmVal.textContent = state.bpm; updateEcgModel(state); prefill(); updateKpis(); });
    el.duration.addEventListener("input", (e) => {
      state.duration = +e.target.value; el.durVal.textContent = state.duration;
      xTimeE.domain([-state.duration, 0]); xTimeA.domain([-state.duration, 0]);
      resetBuffers(); prefill(); drawAxes(); redrawEcgNow(); redrawAbpNow();
    });
    el.fs.addEventListener("change", (e) => { state.fs = +e.target.value; setAbpFs(state.fs); resetBuffers(); prefill(); redrawEcgNow(); redrawAbpNow(); });
    el.ecgAmp.addEventListener("input", (e) => { state.ecgAmp = +e.target.value; el.ecgAmpVal.textContent = state.ecgAmp.toFixed(2); });

    const updateAndPrefill = () => { updateEcgModel(state); prefill(); };
    ["input", "change"].forEach((ev) => {
      el.pAmp.addEventListener(ev, (e) => { state.pAmp = +e.target.value; });
      el.qAmp.addEventListener(ev, (e) => { state.qAmp = +e.target.value; });
      el.rAmp.addEventListener(ev, (e) => { state.rAmp = +e.target.value; });
      el.sAmp.addEventListener(ev, (e) => { state.sAmp = +e.target.value; });
      el.tAmp.addEventListener(ev, (e) => { state.tAmp = +e.target.value; });

      el.pDur.addEventListener(ev, (e) => { state.pDur = +e.target.value; updateAndPrefill(); });
      el.prSeg.addEventListener(ev, (e) => { state.prSeg = +e.target.value; updateAndPrefill(); });
      el.qrsDur.addEventListener(ev, (e) => { state.qrsDur = +e.target.value; updateAndPrefill(); });
      el.stSeg.addEventListener(ev, (e) => { state.stSeg = +e.target.value; updateAndPrefill(); });
      el.tDur.addEventListener(ev, (e) => { state.tDur = +e.target.value; updateAndPrefill(); });
      el.tpDur.addEventListener(ev, (e) => { state.tpDur = +e.target.value; updateAndPrefill(); });
      el.autoTP.addEventListener(ev, (e) => { state.autoTP = e.target.checked; updateAndPrefill(); });

      el.prLvl.addEventListener(ev, (e) => { state.prLevel = +e.target.value; prefill(); });
      el.stLvl.addEventListener(ev, (e) => { state.stLevel = +e.target.value; prefill(); });
      el.tpLvl.addEventListener(ev, (e) => { state.tpLevel = +e.target.value; prefill(); });
    });

    // ABP
    el.sys.addEventListener("input", (e) => { state.sys = +e.target.value; syncSysUI(); afterSysDiaChange(); });
    el.sysN.addEventListener("input", (e) => { state.sys = +e.target.value; syncSysUI(); afterSysDiaChange(); });
    el.dia.addEventListener("input", (e) => { state.dia = +e.target.value; syncDiaUI(); afterSysDiaChange(); });
    el.diaN.addEventListener("input", (e) => { state.dia = +e.target.value; syncDiaUI(); afterSysDiaChange(); });
    el.spo2.addEventListener("input", (e) => { state.spo2 = +e.target.value; syncSpO2UI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.spo2N.addEventListener("input", (e) => { state.spo2 = +e.target.value; syncSpO2UI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.pi.addEventListener("input", (e) => { state.pi = +e.target.value; syncPiUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.piN.addEventListener("input", (e) => { state.pi = +e.target.value; syncPiUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.tof.addEventListener("input", (e) => { state.tof = +e.target.value; syncTofUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.tofN.addEventListener("input", (e) => { state.tof = +e.target.value; syncTofUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.bis.addEventListener("input", (e) => { state.bis = +e.target.value; syncBisUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.bisN.addEventListener("input", (e) => { state.bis = +e.target.value; syncBisUI(); updateMonitorUI(measSys, measDia, measMap, state); });

    el.notchPos.addEventListener("input", (e) => { state.notchPos = +e.target.value; el.notchPosVal.textContent = state.notchPos.toFixed(2); });
    el.notchDepth.addEventListener("input", (e) => { state.notchDepth = +e.target.value; el.notchDepthVal.textContent = state.notchDepth.toFixed(2); });
    el.damp.addEventListener("input", (e) => { state.damping = +e.target.value; el.dampVal.textContent = state.damping.toFixed(2); });
    el.aug.addEventListener("input", (e) => { state.aug = +e.target.value; el.augVal.textContent = state.aug.toFixed(2); });
    el.tau.addEventListener("input", (e) => { state.tauRel = +e.target.value; el.tauVal.textContent = state.tauRel.toFixed(2); });
    el.emd.addEventListener("input", (e) => { state.emdMs = +e.target.value; el.emdVal.textContent = state.emdMs; updateKpis(); });
    el.ptt.addEventListener("input", (e) => { state.pttMs = +e.target.value; el.pttVal.textContent = state.pttMs; updateKpis(); });

    el.regen.addEventListener("click", () => {
      tClock = 0; acc = 0;
      resetBuffers(); prefill(); drawAxes();
      redrawEcgNow(); redrawAbpNow();
      updateMonitorUI(measSys, measDia, measMap, state);
    });

    el.toggle.addEventListener("click", () => {
      state.playing = !state.playing;
      el.toggle.textContent = state.playing ? "Pause" : "Play";
      lastTick = null;
    });

    if (el.toggleControls && el.settingsTitle) {
      const controls = document.querySelector(".controls");
      el.toggleControls.addEventListener("click", () => {
        const content = Array.from(controls.children).filter((child) => child !== el.toggleControls && child !== el.settingsTitle);
        const isHidden = content[0].style.display === "none";
        content.forEach((x) => (x.style.display = isHidden ? "" : "none"));
        el.toggleControls.textContent = isHidden ? "−" : "+";
      });
    }

    if (el.scenarioSelect) {
      el.scenarioSelect.addEventListener("change", (e) => {
        applyScenario(e.target.value);
      });
    }

    if (el.btnVF) {
      el.btnVF.addEventListener("click", () => applyScenario("vf"));
    }

    // sync початкового UI
    const syncAll = () => {
      if (el.bpmVal) el.bpmVal.textContent = Math.round(state.bpm);
      if (el.durVal) el.durVal.textContent = state.duration;
      if (el.ecgAmpVal) el.ecgAmpVal.textContent = state.ecgAmp.toFixed(2);
      syncSysUI(); syncDiaUI(); syncSpO2UI(); syncPiUI(); syncTofUI(); syncBisUI();
    };
    syncAll();
  };

  // ===== Застосування сценарію
  let applyScenario = (name, { skipUiSync = false } = {}) => {
    const key = Object.prototype.hasOwnProperty.call(SCENARIOS, name) ? name : "baseline";
    const scenario = SCENARIOS[key];
    const params = typeof scenario.params === "function" ? scenario.params(state) : { ...scenario.params };

    setState({
      ...params,
      scenario: key,
      ecgMode: params.ecgMode || "sinus",
      abpMode: params.abpMode || "default",
    });

    xTimeE.domain([-state.duration, 0]);
    xTimeA.domain([-state.duration, 0]);
    tClock = 0; acc = 0; lastTick = null;

    resetBuffers();
    afReset();
    avb_lastPhase = null;
    avb_t = 0;

    updateEcgModel(state);
    prefill();
    refreshAbpScale();
    redrawEcgNow();

    measSys = Math.round(state.sys);
    measDia = Math.round(state.dia);
    measMap = Math.round((measSys + 2 * measDia) / 3);
    updateMonitorUI(measSys, measDia, measMap, state);
    updateKpis();

    if (document && document.body) document.body.dataset.scenario = key;
    if (el.toggle) el.toggle.textContent = state.playing ? "Pause" : "Play";

    if (!skipUiSync && el.scenarioSelect) el.scenarioSelect.value = key;
  };

  // Глобал (за бажанням)
  if (typeof window !== "undefined") window.__ECG_applyScenario = (n, o) => applyScenario(n, o);

  // ===== Ресайз
  const resize = () => {
    const wE = el.ecgChart.node().clientWidth || chart.widthEcg;
    if (Math.abs(wE - chart.widthEcg) >= 2) {
      chart.widthEcg = wE; chart.innerWEcg = wE - margins.left - margins.right;
      ecgY.range([chart.innerHEcg, 0]); xTimeE.range([0, chart.innerWEcg]);
      ecgSvg.attr("viewBox", `0 0 ${wE} ${ECG_HEIGHT}`);
      drawGrid(chart.gridE, chart.innerWEcg, chart.innerHEcg);
    }
    const wA = el.abpChart.node().clientWidth || chart.widthAbp;
    if (Math.abs(wA - chart.widthAbp) >= 2) {
      chart.widthAbp = wA; chart.innerWAbp = wA - margins.left - margins.right;
      abpY.range([chart.innerHAbp, 0]); xTimeA.range([0, chart.innerWAbp]);
      abpSvg.attr("viewBox", `0 0 ${wA} ${ABP_HEIGHT}`);
      drawGrid(chart.gridA, chart.innerWAbp, chart.innerHAbp);
    }
    drawAxes(); positionMonitor(); redrawEcgNow(); redrawAbpNow();
  };
  window.addEventListener("resize", resize);

  // ===== Анімація
  const frame = (ts) => {
    if (!state.playing) { lastTick = ts; return; }
    if (lastTick == null) lastTick = ts;
    const dt = Math.max(0, (ts - lastTick) / 1000); lastTick = ts; acc += dt;
    const toGen = Math.floor(acc * state.fs);
    if (toGen > 0) {
      const step = 1 / state.fs;
      for (let k = 0; k < toGen; k++) {
        tClock += step;
        const T = 60.0 / state.bpm;
        const phaseE = wrap01(tClock / T);
        const delay = (state.emdMs + state.pttMs) / 1000;
        const phaseA = wrap01((tClock - delay) / T);

        const ecg = ecgAtPhase(phaseE, state, getEcgModel()) + (Math.random() * 2 - 1) * 0.01;
        const abp = pressureAtPhase(phaseA, state);

        ecgBuf[head] = ecg;
        abpBuf[head] = abp;
        head = (head + 1) % bufLen;

        if (abp < beatMin) beatMin = abp;
        if (abp > beatMax) beatMax = abp;
        beatSum += abp; beatCount++;

        if (prevPhaseA !== null && phaseA < prevPhaseA) {
          measSys = Math.round(beatMax);
          measDia = Math.round(beatMin);
          measMap = Math.round(beatSum / Math.max(1, beatCount));
          updateMonitorUI(measSys, measDia, measMap, state); updateKpis();
          beatMin = 1e9; beatMax = -1e9; beatSum = 0; beatCount = 0;
        }
        prevPhaseA = phaseA;
      }
      acc -= toGen * (1 / state.fs);
      redrawEcgNow(); redrawAbpNow();
    }
  };
  d3.timer(frame);

  // ===== Підключаємо контроли, потім — АВТОСТАРТ VF
  setupControls();
  applyScenario("vf", { skipUiSync: false });

  // Початковий рендер (про всяк випадок)
  positionMonitor();
  updateEcgModel(state);
  prefill();
  drawAxes();
  updateMonitorUI(Math.round(state.sys), Math.round(state.dia), Math.round((state.sys + 2 * state.dia) / 3), state);
  updateKpis();
  redrawEcgNow();
  redrawAbpNow();
  el.toggle.textContent = "Pause";
});
