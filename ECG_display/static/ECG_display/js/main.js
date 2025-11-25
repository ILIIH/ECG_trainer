// main.js (fixed)
// Використовує глобальний d3 з <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
import { setupElements } from "./dom.js?v=dev";
import { initState, getState, setState } from "./state.js?v=dev";
import { setupCharts, drawGrid } from "./ui/charts.js?v=dev";
import { setupTraces, redrawECG, redrawABP } from "./ui/rendering.js?v=dev";
import { setupMonitor } from "./ui/monitor.js?v=dev";
import { updateEcgModel, getEcgModel, ecgModel, ecgBaselineAt } from "./models/ecgModel.js?v=dev";
import { pressureAtPhase, resetFiltAbp, setAbpFs, setVfTauSec } from "./models/abpModel.js?v=dev";
import { clamp, wrap01, gaussWrapped } from "./utils.js?v=dev";


// === Глобальні фази/час ===
let phaseAt = null;        // одна-єдина фазова функція для всього (ЕКГ і АТ)
let tClock = 0, lastTick = null, acc = 0;
const EXACT_SCENARIO_MODE = true;
let __lastAppliedBpm = null;
let __lastBpmRebuildAt = 0;
// Плавні переходи до цільових значень від препаратів
const TAU_HR = 4.0;   // ~секунд до помітної зміни ЧСС
const TAU_BP = 3.0;   // ~секунд до зміни А

//  "база" ЧСС, до якої має повертатись серце
let bpmBaseline = null;


let smoothHR = 0;
let smoothSYS = 0;
let smoothDIA = 0;


// ---------------- VF random state ----------------
let vfPrevPhase = null;
let vfA = 1, vfF = 1, vfSkew = 1;
let vfR1 = Math.random() * Math.PI * 2, vfR2 = Math.random() * Math.PI * 2;
let vfNoise = 0, vfSpike = 0;

function vfOnBeat(kind) {
  vfA = Math.min(2.0, Math.max(0.5, vfA + (Math.random()*2 - 1) * 0.25));
  vfF = Math.min(kind === 'coarse' ? 1.40 : 1.70,
         Math.max(kind === 'coarse' ? 0.70 : 0.90, vfF + (Math.random()*2 - 1) * (kind === 'coarse' ? 0.18 : 0.25)));
  vfSkew = Math.min(2.2, Math.max(0.8, vfSkew + (Math.random()*2 - 1) * 0.35));
  vfR1 = Math.random()*Math.PI*2;
  vfR2 = Math.random()*Math.PI*2;
  if (Math.random() < (kind === 'coarse' ? 0.12 : 0.08)) vfSpike = (kind === 'coarse' ? 0.6 : 0.4);
}

// ---------------- AF random state ----------------
let afPrevPhase = null;
let afC1 = 8, afC2 = 10, afC3 = 12;
let afR1 = 0, afR2 = 0, afR3 = 0;
let afEnv = 1.0;
let afRshift = 0.0;

function afReset() {
  afPrevPhase = null;
  afEnv = 1.0;
  afRshift = 0.0;
  afR1 = Math.random() * 2 * Math.PI;
  afR2 = Math.random() * 2 * Math.PI;
  afR3 = Math.random() * 2 * Math.PI;
}

// ---------------- AVB-III absolute timekeeper ----------------
let avb_lastPhase = null;
let avb_t = 0;


// ---------------- RR plan helpers (для PAC) ----------------
function makeRRPlan(state, horizonBeats = 200) {
  const baseRR = 60 / state.bpm;
  const plan = [];
  for (let i = 0; i < horizonBeats; i++) {
    let rr = baseRR;
    if (state.pac) {
      if (i === state.pac.index) rr = baseRR * (state.pac.coupling ?? 0.75);
      else if (i === state.pac.index + 1) rr = baseRR * (state.pac.post ?? 1.05);
    }
    plan.push(rr);
  }
  return plan;
}

// Повертає функцію phaseAt(tSec) для поточного стану
function makePhaseFn(state) {
  if (!state.pac) {
    const T = 60 / Math.max(1, state.bpm || 60);
    return (timeSec) => wrap01((timeSec >= 0 ? timeSec : 0) / T);
  }
  const plan = makeRRPlan(state, 1000);
  const cum = [0];
  for (let i = 0; i < plan.length; i++) cum.push(cum[i] + plan[i]);
  return (timeSec) => {
    if (timeSec < 0) timeSec = 0;
    let i = 0;
    while (i + 1 < cum.length && timeSec >= cum[i + 1]) i++;
    const local = timeSec - cum[i];
    const rr = plan[Math.min(i, plan.length - 1)];
    return Math.min(0.9999, Math.max(0, local / rr));
  };
}

// Глобальна функція фази (оновлюється при зміні сценарію/ЧСС)
let phaseAtFn = (t) => wrap01(t / 1.0); // заглушка, перезапишемо в DOMContentLoaded

document.addEventListener("DOMContentLoaded", () => {
  const el = setupElements();
  initState(el);
  

  
  const state = getState();
  smoothHR  = state.bpm;
  smoothSYS = state.sys;
  smoothDIA = state.dia;

  if (state.abpGain == null) state.abpGain = 0.75;
  setAbpFs(state.fs);
  setVfTauSec(4.0);
  phaseAtFn = makePhaseFn(state);



// 👉 нове: "база" ЧСС, до якої має повертатись серце
  let bpmBaseline = null;


  const initialDefaults = {
    ...state,
    scenario: "baseline",
    ecgMode: "sinus",
    abpMode: "default",
  };
  // ==== QUIZ MODE ====
const QUIZ_POOL = [

  "sinus_pac7", "sinus_tachy","vf","", "veb_single","lbbb","sinus_brady_mild","mi_stemi","mi_nstemi","af","avb3","asystole"


];
let quizActive = false;
let quizAnswerKey = null;

const $ = (s) => document.querySelector(s);

function scenarioLabel(key) {
  // використовує твої підписи з SCENARIOS (падаємо на key, якщо label не заданий)
  return (SCENARIOS[key] && SCENARIOS[key].label) ? SCENARIOS[key].label : key;
}

function fillQuizOptions() {
  const sel = $("#quizGuess");
  if (!sel) return;
  sel.innerHTML = "";
  QUIZ_POOL.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = scenarioLabel(k);
    sel.appendChild(opt);
  });
}

function pickRandom(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

function startQuiz() {
  quizActive = true;
  
  const st = getState();
  st.abpGain = 1.00
  if(el.abpGain) el.abpGain.value = 1.00;
  if(el.abpGainVal)el.abpGainVal.textContent="1.00";
  // підготувати список відповідей
  fillQuizOptions();

  // вибрати сценарій-відповідь
  quizAnswerKey = pickRandom(QUIZ_POOL);

  renderClinicalCaseForScenario(quizAnswerKey)
  // застосувати та перемалювати
  applyScenario(quizAnswerKey, { skipUiSync: true });

}

function submitGuess() {
  if (!quizActive || !quizAnswerKey) return;
  const guess = $("#quizGuess")?.value;
  const fb = $("#quizFeedback");
  if (!fb) return;

  if (guess === quizAnswerKey) {
    fb.textContent = `✅ Вірно: ${scenarioLabel(quizAnswerKey)}. Натисни «Нове завдання» для наступного.`;
    fb.classList.remove("quiz-bad"); fb.classList.add("quiz-ok");
  } else {
    fb.textContent = `❌ Невірно. Спробуй ще або натисни «Показати відповідь».`;
    fb.classList.remove("quiz-ok"); fb.classList.add("quiz-bad");
  }
}

function revealAnswer() {
  if (!quizActive || !quizAnswerKey) return;
  const fb = $("#quizFeedback");
  if (fb) {
    fb.textContent = `🟡 Відповідь: ${scenarioLabel(quizAnswerKey)}. Натисни «Нове завдання» для наступного.`;
    fb.classList.remove("quiz-bad"); fb.classList.add("quiz-ok");
  }
}

// Прив’язки кнопок
$("#quizStart")?.addEventListener("click", startQuiz);
$("#quizSubmit")?.addEventListener("click", submitGuess);
$("#quizReveal")?.addEventListener("click", revealAnswer);

// якщо хочеш, щоб сторінка одразу стартувала у вікторині — розкоментуй:
// startQuiz();

// Якщо користувач вийшов з вікторини (необов’язково):
function exitQuiz() {
  quizActive = false;
  document.body.classList.remove("quiz-mode");
  if (el.scenarioSelect) el.scenarioSelect.disabled = false;
}
// можеш викликати exitQuiz() з консолі або додати свою кнопку

  // ---------------- SCENARIOS ----------------
  const SCENARIOS = {
    baseline: { label: "Синусовий ритм", params: initialDefaults },

    vf: {
      label: "Фібриляція шлуночків",
        case: {
        title: "Клінічний сценарій",
        demographics: "Чоловік, 48 років.",
        presenting: "На прийомі у проктолога скаржиться на відчуття завмирання у серці під час актів масивної дефікації. Проктолог вирішив оглянути проблемне місце і під час пальпації пацієнт замичав і втратив свідомість. На місце прибула чергова бригада анестезіологів із вами начолі. Поряд з бездиханним тілом стоїть ошарашений проктолог, медсестра підсуває під ніс нашатир. Невідомий чоловік з коридору кричить: Ви його вбили!! ВБИИИИЛИ !!!! Бабки з черги охають і ахають. За вікном йде лапчатий сніг В повітрі шириться запах калу",
        history: "Гомосексуаліст.",
        exam: "пацієнт блідий, зіниці розширені",
        investigations: "-"
      },
      params: {
        scenario: "vf",
        ecgMode: "vf",
        abpMode: "default",
        bpm: 140, duration: 10, fs: 30, ecgAmp: 0.5,
        pAmp: 0, pDur: 60, qAmp: -0.1, qrsDur: 50, rAmp: 0.25, sAmp: -0.25,
        tAmp: 0, tDur: 60, prSeg: 0, stSeg: 0, tpDur: 120, autoTP: true,
        prLevel: 0, stLevel: 0, tpLevel: 0,
        sys: 40, dia: 30, spo2: 0, pi: 1.2, tof: 5, bis: 10,
        notchPos: 0.36, notchDepth: 0.15, damping: 0.1, aug: 0.05, tauRel: 0.35,
        emdMs: 120, pttMs: 80, playing: true,
      },
    },
    // 1) AV-блокада I ступеня (подовжений PR > 200 мс)
first_degree_av_block: {
  label: "AV-блокада I ступеня",
  desc: "Синусовий ритм, рівномірний; PR подовжений (~260 мс).",
  case: {
    title: "Клінічний сценарій",
    demographics: "Чоловік, 48 років.",
    presenting: "Планова ЕКГ, скарг немає.",
    history: "Інколи відчуття «повільного» пульсу.",
    exam: "АТ 126/78 мм рт. ст., пульс регулярний.",
    investigations: "-"
  },
  params: {
    scenario: "first_degree_av_block",
    ecgMode: "sinus",
    abpMode: "default",
    bpm: 72, duration: 10, fs: 500,
    ecgAmp: 1.0,
    pAmp: 0.12, pDur: 110,
    prSeg: 260,             // головне: довгий PR
    qAmp: -0.12, qrsDur: 90, rAmp: 1.0, sAmp: -0.25,
    stSeg: 120, tAmp: 0.30, tDur: 180,
    tpDur: 240, autoTP: true,
    prLevel: 0, stLevel: 0, tpLevel: 0,
    sys: 126, dia: 78, spo2: 98, pi: 3.0, tof: 90, bis: 60,
    notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30, tauRel: 0.35,
    emdMs: 120, pttMs: 80, playing: true,
  },
},

// 2) Легка синусова брадикардія (≈50–60/хв)
sinus_brady_mild: {
  label: "Легка синусова брадикардія",
  desc: "Синусовий ритм, ЧСС ~54/хв; інше — норма.",
  case: {
    title: "Клінічний сценарій",
    demographics: "Жінка, 26 років (спортсменка).",
    presenting: "Рутинний огляд, скарг немає.",
    exam: "Пульс 54/хв, регулярний. АТ 118/70.",
    investigations: "-"
  },
  params: {
    scenario: "sinus_brady_mild",
    ecgMode: "sinus",
    abpMode: "default",
    bpm: 20, duration: 12, fs: 30,
    ecgAmp: 1.0,
    pAmp: 0.12, pDur: 110, prSeg: 40,
    qAmp: -0.12, qrsDur: 90, rAmp: 1.0, sAmp: -0.25,
    stSeg: 120, tAmp: 0.30, tDur: 180,
    tpDur: 300, autoTP: true,     // довший TP через нижчу ЧСС
    prLevel: 0, stLevel: 0, tpLevel: 0,
    sys: 90, dia: 70, spo2: 99, pi: 3.5, tof: 90, bis: 60,
    notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30, tauRel: 0.35,
    emdMs: 120, pttMs: 80, playing: true,
  },
},

// 3) LBBB — блокада лівої ніжки пучка Гіса
lbbb: {
  label: "LBBB (ліва ніжка пучка Гіса)",
  desc: "Синусовий ритм. Провідність через ліву ніжку заблокована → широкий, спотворений QRS (≥120 мс) і дискордантні ST-T.",
  case: {
    title: "Клінічна довідка: LBBB",
    demographics: "Чоловік, 64 роки; АГ у анамнезі.",
    presenting: "Задишка при навантаженні, інколи серцебиття.",
    history: "Епізоди підвищеного АТ; специфічних скарг раніше не було.",
    past: "—",
    exam: "АТ 140/80 мм рт. ст., пульс 84/хв, SpO₂ 97%.",
    investigations: `-`
  },
  params: {
    scenario: "lbbb",
    ecgMode: "sinus",
    abpMode: "default",

    // Ритм/вікно
    bpm: 84,
    duration: 10,
    fs: 40,

    // Хвилі та інтервали (модель Lead II-подібна)
    ecgAmp: 1.0,
    pAmp: 0.12,
    pDur: 110,
    prSeg: 160,          // PR «норма» з прикладу (~160 мс)

    // Широкий деформований QRS без q, з дискордантною реполяризацією
    qAmp: -0.02,         // майже відсутній q
    qrsDur: 450,         // >120 мс — ключ LBBB
    rAmp: 0.60,
    sAmp: -0.60,         // глибший S для Lead II-подібного вигляду

    stSeg: 160,
    stLevel: 0,      // помірна ST↓ (дискордантність)
    tAmp: -0.30,         // інверсія T (дискордантна)
    tDur: 200,

    tpDur: 220,
    autoTP: true,

    // Базові рівні
    prLevel: 0,
    tpLevel: 0,

    // Гемодинаміка (помірні зміни)
    sys: 140,
    dia: 80,
    spo2: 97,
    pi: 2.5,
    tof: 90,
    bis: 60,

    // Форма ABP
    notchPos: 0.36,
    notchDepth: 0.22,
    damping: 0.28,
    aug: 0.25,
    tauRel: 0.40,

    // Затримки
    emdMs: 120,
    pttMs: 80,

    playing: true,
  },
},


// 4) Одинична шлуночкова екстрасистола (VEB/PVC)
veb_single: {
  label: "Одинична шлуночкова екстрасистола",
  desc: "Синусовий ритм з одним раннім широким комплексом і компенсаторною паузою.",
  case: {
    title: "Клінічний сценарій",
    demographics: "Жінка, 35 років.",
    presenting: "Відчуття «завмирання» серця, поодинокі.",
    exam: "АТ 122/76, пульс здебільшого регулярний.",
    investigations: "-"
  },
  params: {
    scenario: "veb_single",
    ecgMode: "sinus",
    abpMode: "default",
    bpm: 75, duration: 10, fs: 30,
    ecgAmp: 1.0,
    pAmp: 0.12, pDur: 110, prSeg: 160,
    qAmp: -0.12, qrsDur: 90, rAmp: 1.0, sAmp: -0.25,
    stSeg: 120, tAmp: 0.30, tDur: 180,
    tpDur: 240, autoTP: true,
    prLevel: 0, stLevel: 0, tpLevel: 0,
    // RR-план: один ранній удар + компенсаторна пауза
    // (використовує ту саму логіку, що і для PAC у твоєму коді)
    pac: { index: 6, coupling: 0.60, post: 1.40 },
    // (необов’язково) маркер для кастомної морфології,
    // якщо колись захочеш «розширювати» саме цей комплекс:
    ectopicMorph: "veb",
    sys: 122, dia: 76, spo2: 98, pi: 3.0, tof: 90, bis: 60,
    notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30, tauRel: 0.35,
    emdMs: 120, pttMs: 80, playing: true,
  },
  veb: {
  index: 6,       // 7-й комплекс на стрічці (0-базова нумерація)
  qrsScale: 1.8,  // у скільки разів ширше за нормальний (1.6–2.0 виглядає добре)
  rMul: 0.8,      // (необов’язково) трохи менша R
  sMul: 1.3       // (необов’язково) трохи глибший S
}
},

// 5) Синусова тахікардія (>100/хв, P перед кожним QRS)
sinus_tachy: {
  label: "Синусова тахікардія",
  desc: "Є P-хвиля перед кожним QRS. ЧСС > 100/хв (≈118/хв).",
  case: {
    title: "Клінічний сценарій",
    demographics: "Чоловік, 22 роки.",
    presenting: "Тривога/фізичне навантаження перед ЕКГ.",
    exam: "АТ 130/80, пульс 118/хв, регулярний.",
    investigations: "-"
  },
  params: {
    scenario: "sinus_tachy",
    ecgMode: "sinus",
    abpMode: "default",
    bpm: 118, duration: 10, fs: 30,
    ecgAmp: 1.0,
    pAmp: 0.12, pDur: 110, prSeg: 150,     // коротший PR допустимий при тахі
    qAmp: -0.12, qrsDur: 90, rAmp: 1.0, sAmp: -0.25,
    stSeg: 120, tAmp: 0.30, tDur: 170,
    tpDur: 160, autoTP: true,              // коротший TP через високу ЧСС
    prLevel: 0, stLevel: 0, tpLevel: 0,
    sys: 130, dia: 80, spo2: 98, pi: 3.0, tof: 90, bis: 60,
    notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30, tauRel: 0.35,
    emdMs: 120, pttMs: 80, playing: true,
  },
},

    sinus_pac7: {
      label: "Синус з одиничною передсердною екстрасистолою (7-й)",
      desc: "Нормальний синус; 7-й комплекс приходить раніше (PAC). Пауза не повністю компенсаторна.",
      case: {
        title: "Клінічний сценарій",
        demographics: "Чоловік, 28 років.",
        presenting: "Асимптомний, планове обстеження.",
        history: "Скарг немає.",
        past: "Апендиктомія у 17 років.",
        exam: "Пульс 72/хв, регулярний за винятком одного раннього скорочення. АТ 128/80.",
        investigations: "-"
      },
      params: {
        scenario: "sinus_pac7",
        ecgMode: "sinus",
        abpMode: "default",
        bpm: 72, duration: 10, fs: 40,
        ecgAmp: 1.0,
        pAmp: 0.12, pDur: 110, prSeg: 160,
        qAmp: -0.12, qrsDur: 90, rAmp: 1.0, sAmp: -0.25,
        stSeg: 120, tAmp: 0.30, tDur: 180,
        tpDur: 240, autoTP: true,
        prLevel: 0, stLevel: 0, tpLevel: 0,
        sys: 80, dia: 70, spo2: 98, pi: 3.0, tof: 90, bis: 60,
        notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30, tauRel: 0.35,
        emdMs: 120, pttMs: 80, playing: true,
        pac: { index: 6, coupling: 0.75, post: 1.55 },
      },
    },

    mi_stemi: {
      label: "ІМ з підйомом ST ",
      params: {
        scenario: "mi_stemi",
        ecgMode: "sinus",
        abpMode: "default",
        bpm: 96, duration: 10, fs: 50,
        ecgAmp: 1.0,
        pAmp: 0.12, pDur: 110, prSeg: 160,
        qAmp: -0.35, qrsDur: 100, rAmp: 0.75, sAmp: 0.0,
        stSeg: 200, stLevel: 0.35, tAmp: 0.60, tDur: 200,
        tpDur: 220, autoTP: true, prLevel: 0, tpLevel: 0,
        sys: 200, dia: 60, spo2: 93, pi: 1.5, tof: 90, bis: 60,
        notchPos: 0.36, notchDepth: 0.18, damping: 0.28, aug: 0.25, tauRel: 0.40,
        emdMs: 120, pttMs: 80, playing: true,
      },
    },

    mi_nstemi: {
      label: "Ішемія/NSTEMI (ST↓, T інверсія)",
      params: {
        scenario: "mi_nstemi",
        ecgMode: "sinus",
        abpMode: "default",
        bpm: 88, duration: 10, fs: 30,
        ecgAmp: 1.0,
        pAmp: 0.12, pDur: 110, prSeg: 160,
        qAmp: -0.10, qrsDur: 90, rAmp: 0.95, sAmp: -0.25,
        stSeg: 160, stLevel: -0.20, tAmp: -0.40, tDur: 180,
        tpDur: 240, autoTP: true,
        prLevel: 0, tpLevel: 0,
        sys: 110, dia: 70, spo2: 96, pi: 2.4, tof: 90, bis: 60,
        notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30, tauRel: 0.35,
        emdMs: 120, pttMs: 80, playing: true,
      },
    },

    af: {
      label: "Фібриляція передсердь",
      params: {
        scenario: "af",
        ecgMode: "af",
        abpMode: "default",
        bpm: 110, duration: 10, fs: 30,
        ecgAmp: 1.0,
        pAmp: 0.0, pDur: 90, prSeg: 0,
        qAmp: -0.12, qrsDur: 90, rAmp: 1.0, sAmp: -0.25,
        stSeg: 120, tAmp: 0.30, tDur: 180,
        tpDur: 240, autoTP: true,
        prLevel: 0, stLevel: 0, tpLevel: 0,
        sys: 120, dia: 70, spo2: 98, pi: 3.2, tof: 90, bis: 60,
        notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30, tauRel: 0.35,
        emdMs: 120, pttMs: 80, playing: true,
      },
    },

    avb3: {
      label: "Повна AV-блокада (III)",
      params: {
        scenario: "avb3",
        ecgMode: "avb3",
        bpm: 26,
        avbAtrialBpm: 78,
        avbVentricularBpm: 26,
        duration: 10, fs: 30, ecgAmp: 1.0,
        pAmp: 0.12, pDur: 110,
        qAmp: -0.12, qrsDur: 110, rAmp: 0.9, sAmp: -0.20,
        tAmp: 0.30, tDur: 180,
        prSeg: 0, stSeg: 0, tpDur: 280, autoTP: true,
        prLevel: 0, stLevel: 0, tpLevel: 0,
        sys: 120, dia: 70, spo2: 98, pi: 3.2, tof: 90, bis: 60,
        notchPos: 0.36, notchDepth: 0.20, damping: 0.25, aug: 0.30,
        tauRel: 0.35, emdMs: 120, pttMs: 80, playing: true,
      },
    },

    asystole: {
      label: "Асистолія",
      params: {
        scenario: "asystole",
        ecgMode: "flatline",
        abpMode: "flatline",
        bpm: 40, duration: 10, fs: 30, ecgAmp: 0.5,
        pAmp: 0, pDur: 60, qAmp: 0, qrsDur: 40, rAmp: 0, sAmp: 0, tAmp: 0,
        prSeg: 0, stSeg: 0, tDur: 60, tpDur: 400, autoTP: true,
        prLevel: 0, stLevel: 0, tpLevel: 0,
        sys: 30, dia: 20, spo2: 50, pi: 0.5, tof: 0, bis: 0,
        notchPos: 0.36, notchDepth: 0.1, damping: 0.4, aug: 0, tauRel: 0.4,
        emdMs: 120, pttMs: 80, playing: true,
      },
    },
  };
function resolveScenarioKey(key) {
  const k = String(key || "").trim();         // знімаємо випадкові пробіли
  if (SCENARIOS && SCENARIOS[k]) return k;

  // запасний варіант: спробувати знайти по label (необов’язково, але корисно)
  if (SCENARIOS) {
    const low = k.toLowerCase();
    for (const [kk, v] of Object.entries(SCENARIOS)) {
      if ((v?.label || "").toLowerCase() === low) return kk;
    }
  }
  console.warn("[quiz] Scenario not found:", key);
  return null;
}
  // ---------------- Clinical box renderer ----------------
function renderClinicalCaseForScenario(rawKey){
  const box = document.getElementById("clinicalScenario");
  if (!box) return;

  const key = resolveScenarioKey(rawKey);
  const s = (key && SCENARIOS && SCENARIOS[key]) ? SCENARIOS[key] : null;

  // якщо немає такого сценарію взагалі — покажемо повідомлення
  if (!s) {
    box.hidden = false;
    box.innerHTML = `
      <div class="title">Сценарій не знайдено</div>
      <div class="section"><div class="section-body">key: <code>${String(rawKey)}</code></div></div>
    `;
    return;
  }

  const c = s.case || null;
  const label = s.label || key;
  const desc  = s.desc  || "";

  const sect = (title, body) => body
    ? `<div class="section"><div class="section-title">${title}</div><div class="section-body">${body}</div></div>`
    : "";

  let html = "";
  if (c) {
    html =
      `<div class="title">${c.title || label}</div>` +
      sect("Demographics", c.demographics) +
      sect("Presenting complaint", c.presenting) +
      sect("History of presenting complaint", c.history) +
      sect("Past medical history", c.past) +
      sect("Examination", c.exam) +
      sect("Investigations", c.investigations);
  } else {
    // fallback: показати бодай label/desc
    html =
      `<div class="title">${label}</div>` +
      (desc ? `<div class="section"><div class="section-body">${desc}</div></div>` :
              `<div class="section"><div class="section-body">Опис відсутній.</div></div>`);
  }

  box.innerHTML = html;
  box.hidden = false;
}






  // ---------------- Charts & axes ----------------
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
    axesE.append("text").attr("class", "label").attr("x", innerWEcg).attr("y", innerHEcg + 20).attr("text-anchor", "end").text("час, с (останнє −T…0)");
    axesE.append("text").attr("class", "label").attr("x", -8).attr("y", 10).attr("text-anchor", "end").text("мВ");

    const axAleft = d3.axisLeft(abpY).ticks(5);
    const axAbottom = d3.axisBottom(xTimeA).ticks(Math.max(2, Math.min(10, Math.round(state.duration))));
    axesA.append("g").attr("class", "axis").call(axAleft);
    axesA.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHAbp})`).call(axAbottom);
    axesA.append("text").attr("class", "label").attr("x", innerWAbp).attr("y", innerHAbp + 20).attr("text-anchor", "end").text("час, с (останнє −T…0)");
    axesA.append("text").attr("class", "label").attr("x", -8).attr("y", 10).attr("text-anchor", "end").text("мм рт. ст.");
  };

  drawGrid(gridE, innerWEcg, innerHEcg);
  drawGrid(gridA, innerWAbp, innerHAbp);
  drawAxes();

  // ---------------- Traces & monitor ----------------
  const { ecgPath, abpPath, ecgIso, abpIso } = setupTraces(traceE, traceA);
  const { updateMonitor: updateMonitorUI, positionMonitor } = setupMonitor(gA, innerWAbp);

  // ---------------- ECG generator ----------------
  const ecgAtPhase = (phase, state) => {
    
    // AF
    if (state.ecgMode === "af") {
      if (afPrevPhase !== null && phase < afPrevPhase) {
        const T = 60.0 / Math.max(30, state.bpm || 60);
        const f1 = 6 + Math.random() * 5;
        const f2 = 6 + Math.random() * 5;
        const f3 = 6 + Math.random() * 5;
        afC1 = f1 * T; afC2 = f2 * T; afC3 = f3 * T;
        afEnv = 0.8 + Math.random() * 0.5;
        afRshift = (Math.random() - 0.5) * 0.05;
        afR1 = Math.random() * 2 * Math.PI;
        afR2 = Math.random() * 2 * Math.PI;
        afR3 = Math.random() * 2 * Math.PI;
      }
      afPrevPhase = phase;

      const base = state.tpLevel || 0;
      const k = state.ecgAmp || 1;
      const phi = phase * 2 * Math.PI;
      const fWaves =
          1.00 * Math.sin(afC1 * phi + afR1) +
          0.65 * Math.sin(afC2 * phi + afR2) +
          0.45 * Math.sin(afC3 * phi + afR3);
      let v = base + k * (0.04 * afEnv) * fWaves;

      const m = ecgModel;
      if (m) {
        const sh = afRshift;
        v += k * (state.qAmp ?? -0.12) * gaussWrapped(phase, (m.muQ + sh) % 1, m.sQ);
        v += k * (state.rAmp ?? 1.00)  * gaussWrapped(phase, (m.muR + sh) % 1, m.sR);
        v += k * (state.sAmp ?? -0.25) * gaussWrapped(phase, (m.muS + sh) % 1, m.sS);
        v += k * (state.tAmp ?? 0.30)  * gaussWrapped(phase, m.muT, m.sT);
      }
      v += (Math.random() * 2 - 1) * 0.01;
      return v;
    }

    // Flatline
    if (state.ecgMode === "flatline") {
      const baseline = state.tpLevel || 0;
      return baseline + (Math.random() * 2 - 1) * 0.02;
    }

    // AVB-III
    if (state.ecgMode === "avb3") {
      const Tref = 60.0 / (state.bpm || 60);
      if (avb_lastPhase == null) {
        avb_lastPhase = phase;
      } else {
        let dphi = phase - avb_lastPhase;
        if (dphi < -0.5) dphi += 1;
        if (dphi > 0) avb_t += dphi * Tref;
        avb_lastPhase = phase;
      }

      const aBpm = clamp(state.avbAtrialBpm ?? 75, 60, 90);
      const vBpm = clamp(state.avbVentricularBpm ?? 26, 20, 30);
      const Ta = 60 / aBpm, Tv = 60 / vBpm;
      const pha = wrap01(avb_t / Ta);
      const phv = wrap01(avb_t / Tv);

      const base = state.tpLevel || 0;
      const k = state.ecgAmp || 1;

      const pAmp  = state.pAmp  ?? 0.12;
      const pDur  = Math.max(40, state.pDur  ?? 110);
      const sP    = ((pDur/1000) / Ta) / 5;
      const muP   = 0.18;

      const qAmp  = state.qAmp  ?? -0.12;
      const rAmp  = state.rAmp  ?? 0.9;
      const sAmp  = state.sAmp  ?? -0.20;
      const tAmp  = state.tAmp  ?? 0.30;

      const qrsDur = Math.max(60, state.qrsDur ?? 110);
      const fQRS   = (qrsDur/1000) / Tv;
      const muR    = 0.02;
      const muQ    = wrap01(muR - 0.25 * fQRS);
      const muS    = wrap01(muR + 0.25 * fQRS);
      const sQ     = Math.max(1e-3, fQRS * 0.12);
      const sR     = Math.max(1e-3, fQRS * 0.16);
      const sS     = Math.max(1e-3, fQRS * 0.12);

      const tDur   = Math.max(120, state.tDur ?? 180);
      const sT     = ((tDur/1000) / Tv) / 5;
      const muT    = wrap01(muR + 0.38);

      let v = base;
      v += k * pAmp * gaussWrapped(pha, muP, sP);
      v += k * qAmp * gaussWrapped(phv, muQ, sQ);
      v += k * rAmp * gaussWrapped(phv, muR, sR);
      v += k * sAmp * gaussWrapped(phv, muS, sS);
      v += k * tAmp * gaussWrapped(phv, muT, sT);
      v += (Math.random() * 2 - 1) * 0.01;
      return v;
    }

    // VF
    if (state.ecgMode === "vf") {
      const kind = state.vfType === "fine" ? "fine" : "coarse";
      if (vfPrevPhase !== null && phase < vfPrevPhase) vfOnBeat(kind);
      vfPrevPhase = phase;

      const base = state.tpLevel || 0;
      const A0   = state.ecgAmp || 1;
      const A = A0 * (kind === "coarse" ? 1.2 : 0.7) * (0.9 + 0.2 * vfA);

      const phi  = phase * 2 * Math.PI;
      const f0   = (state.vfDominant ?? (kind === "coarse" ? 7.5 : 14.0)) * (1.0 + 0.25 * (vfF - 1.0));
      const am = 0.75 + 0.25 * Math.sin(0.40 * phi + vfR1) + 0.10 * Math.sin(0.13 * phi + vfR2);
      const fm = 1.00 + 0.22 * Math.sin(0.60 * phi + vfR1) + 0.09 * Math.sin(0.22 * phi + vfR2);
      const th = phi * f0 * fm;

      let x = Math.sin(th) + 0.35 * Math.sin(2 * th + 0.8) + 0.18 * Math.sin(3 * th + 1.6);
      x = Math.tanh((kind === "coarse" ? 1.6 : 1.3) * vfSkew * x);

      vfNoise = 0.95 * vfNoise + 0.05 * (Math.random() * 2 - 1);
      vfSpike *= 0.86;
      const spikes = vfSpike * (Math.random() * 2 - 1);

      return base + A * am * x + (kind === "coarse" ? 0.05 : 0.08) * vfNoise + (kind === "coarse" ? 0.20 : 0.12) * spikes;
    }

    // Sinus
    const m = ecgModel;
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

  // ---------------- Buffers ----------------
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

  // ---------------- KPIs ----------------
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
  const st = S();
  const bv = baseVitals(); // сценарні в квізі
  const top = Math.max(40, Math.max(bv.sys, st.sys, bv.dia, st.dia)) + 20;
  abpY.domain([0, top]);
  drawGrid(gridA, innerWAbp, innerHAbp);
  drawAxes();
  positionMonitor();
  redrawABP(abpBuf, head, bufLen, idxToXabp, abpY, abpPath, abpIso, innerWAbp, innerHAbp);
};




  // ---------------- Prefill ----------------



const prefill = () => {
  const st = S();
  const step = 1 / st.fs;
  let t = -st.duration;

  // Базові (сценарні у квізі) вітали
  const bv = baseVitals();
  const sEff = { ...st, bpm: bv.bpm, sys: bv.sys, dia: bv.dia };

  // Локальна фаза під ефективний bpm
  const phaseLocal = makePhaseFn(sEff);

  const startAbp = sEff.scenario === "vf"
    ? Math.round((sEff.sys + 2 * sEff.dia) / 3)
    : sEff.dia;

  resetFiltAbp?.(startAbp);

  // обнулення вимірів
  prevPhaseA = null; beatMin = 1e9; beatMax = -1e9; beatSum = 0; beatCount = 0;

  // reset randoms/modes
  vfPrevPhase = null; vfA = 1; vfF = 1; vfSkew = 1; vfNoise = 0; vfSpike = 0;
  vfR1 = Math.random() * Math.PI * 2; vfR2 = Math.random() * Math.PI * 2;
  avb_lastPhase = null; avb_t = 0; afReset();

  head = 0;
  for (let i = 0; i < bufLen; i++) {
    const delay = (sEff.emdMs + sEff.pttMs) / 1000;
    const phaseE = phaseLocal(t + st.duration / 3);
    const phaseA = phaseLocal(t + st.duration / 3 - delay);

    const ecg = 3 * ecgAtPhase(phaseE, sEff) + (Math.random() * 2 - 1) * 0.01;

    let abpRaw = pressureAtPhase(phaseA, sEff);

    // У exact-режимі примушуємо abpGain=1 (встановили в applyScenario)
    const g = Math.max(0, Math.min(1, sEff.abpGain ?? st.abpGain ?? 1));
    const abp = sEff.dia + (abpRaw - sEff.dia) * g;

    ecgBuf[head] = ecg;
    abpBuf[head] = abp;
    head = (head + 1) % bufLen;

    // вимір за удар
    if (abp < beatMin) beatMin = abp;
    if (abp > beatMax) beatMax = abp;
    beatSum += abp; beatCount++;

    if (prevPhaseA !== null && phaseA < prevPhaseA) {
      // В exact-режимі KPI = сценарним
      if (EXACT_SCENARIO_MODE) {
        measSys = Math.round(sEff.sys);
        measDia = Math.round(sEff.dia);
        measMap = Math.round((measSys + 2 * measDia) / 3);
      } else {
        measSys = Math.round(beatMax);
        measDia = Math.round(beatMin);
        measMap = Math.round(beatSum / Math.max(1, beatCount));
      }
      updateMonitorUI?.(measSys, measDia, measMap, sEff);
      updateKpis?.();
      beatMin = 1e9; beatMax = -1e9; beatSum = 0; beatCount = 0;
    }
    prevPhaseA = phaseA;
    t += step;
  }
  head = 0;
};



  const redrawEcgNow = () => redrawECG(ecgBuf, head, bufLen, idxToXecg, ecgY, ecgPath, ecgIso, innerWEcg, innerHEcg);
  const redrawAbpNow = () => redrawABP(abpBuf, head, bufLen, idxToXabp, abpY, abpPath, abpIso, innerWAbp, innerHAbp);

  // ---------------- Controls ----------------
  const setupControls = () => {

    if (el.abpGain && el.abpGainVal) {
  el.abpGain.value = state.abpGain;
  el.abpGainVal.textContent = (+state.abpGain).toFixed(2);
  el.abpGain.addEventListener("input", (e) => {
    state.abpGain = +e.target.value;
    el.abpGainVal.textContent = state.abpGain.toFixed(2);
    // щоб відразу побачити ефект — перемальовуємо буфер
    prefill();
    redrawAbpNow();
  });
}

  // ==== DRUG UI boluses (заповнення списків та обробка "Ввести")
// ==== DRUG UI boluses (повністю переписано)
(function setupDrugUi() {
  const sel       = document.getElementById("drugSelect");
  const unitSel   = document.getElementById("drugUnit");
  const doseInput = document.getElementById("drugDose");
  const btn       = document.getElementById("drugGive");

  if (!sel || !unitSel || !doseInput || !btn) return;

  // --- гарантуємо наявність селектора розведення поруч із unitSel ---
  let dilSel = document.getElementById("drugDilution");
  if (!dilSel) {
    dilSel = document.createElement("select");
    dilSel.id = "drugDilution";
    dilSel.style.minWidth = "120px";
    dilSel.style.marginLeft = "6px";
    dilSel.style.display = "none";
    // вставляємо одразу після селектора одиниць
    unitSel.parentElement?.insertBefore(dilSel, unitSel.nextSibling);
  }

  // --- заповнення списку препаратів (за label) ---
  const entries = Object.entries(DRUGS).sort((a, b) =>
    String(a[1]?.label || a[0]).localeCompare(String(b[1]?.label || b[0]), "uk")
  );
  sel.innerHTML = "";
  for (const [key, d] of entries) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = d.label || key;
    sel.appendChild(opt);
  }

  // --- допоміжні функції ---
  function refreshUnits() {
    const d = DRUGS[sel.value];
    unitSel.innerHTML = "";
    if (!d) return;

    // одиниці дози
    (d.units || []).forEach(u => {
      const o = document.createElement("option");
      o.value = o.textContent = u;
      unitSel.appendChild(o);
    });
    unitSel.value = d.defaultUnit || (d.units?.[0] ?? "");

    // розведення показуємо лише коли це адреналін у мл
    refreshDilutions();
  }

  function refreshDilutions() {
    const d = DRUGS[sel.value];
    if (!d) return;

    // показуємо dilution тільки для адреналіну з одиницею "ml"
    const shouldShow =
      sel.value === "adrenaline" && (unitSel.value === "ml" || unitSel.value === "mL");

    if (!shouldShow) {
      dilSel.style.display = "none";
      dilSel.innerHTML = "";
      return;
    }

    // заповнюємо три фіксовані розведення
    const items = ["1:1000", "1:100", "1:10"];
    dilSel.innerHTML = "";
    items.forEach(v => {
      const o = document.createElement("option");
      o.value = o.textContent = v;
      dilSel.appendChild(o);
    });
    dilSel.style.display = "";
  }

  // --- події ---
  sel.addEventListener("change", refreshUnits);
  unitSel.addEventListener("change", refreshDilutions);

  btn.addEventListener("click", () => {
    const key = sel.value;
    const unit = unitSel.value;
    const dose = parseFloat(doseInput.value);
    const dilution = dilSel.style.display !== "none" ? dilSel.value : null;

    if (!isFinite(dose) || dose <= 0) {
      alert("Вкажи коректну дозу > 0");
      return;
    }

    // прокидаємо dilution у giveDrugAndLog (підтримано в DRUGS.adrenaline.apply)
    giveDrugAndLog(key, dose, unit, false, dilution);

    // (опційно) очищаємо поле дози
    // doseInput.value = "";
  });

  // --- ініціалізація ---
  refreshUnits();
})();


function createInfuzomat(d, dose, sel, unitSel) {
  const key = sel.value;
  const unit = unitSel.value;

  // Start infusion using your helper
  startInfusion(key, dose, unit);

  // Create main container div
  const line = document.createElement("div");
  line.style.display = "flex";
  line.style.alignItems = "center";
  line.style.gap = "10px";
  line.style.marginBottom = "8px";

  // Create a sub-container for text and image
  const leftSide = document.createElement("div");
  leftSide.style.display = "flex";
  leftSide.style.flexDirection = "column";
  leftSide.style.alignItems = "center";

  // Add text
  const text = document.createElement("p");
  text.textContent = `[Інфузомат : ${new Date().toLocaleTimeString()}] ${d.label}: ${dose} ${unit}`;
  text.style.margin = "0 0 5px 0";
  leftSide.appendChild(text);

  // Add image (Infusomat icon)
  const image = document.createElement("img");
  image.src = infuzomatUrl; // make sure this variable is defined globally
  image.alt = "Infuzomat Logo";
  image.style.width = "180px";
  image.style.height = "100px";
  leftSide.appendChild(image);

  // Create right-side container for buttons
  const rightSide = document.createElement("div");
  rightSide.style.display = "flex";
  rightSide.style.flexDirection = "column";
  rightSide.style.gap = "5px";

  // --- Change button ---
  const changeBtn = document.createElement("button");
  changeBtn.textContent = "Змінити";
  rightSide.appendChild(changeBtn);

  changeBtn.addEventListener("click", () => {
    const newDose = prompt("Введіть нову швидкість інфузії:", dose);
    if (newDose !== null && !isNaN(newDose)) {
      dose = Number(newDose);
      text.textContent = `[Інфузомат : ${new Date().toLocaleTimeString()}] ${d.label}: ${dose} ${unit}`;
      startInfusion(key, dose, unit); // restart with new rate
    }
  });

  // --- Stop button ---
  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Відключити";
  rightSide.appendChild(stopBtn);

  stopBtn.addEventListener("click", () => {
    stopInfusion(key);

    const log = document.getElementById("drugInfLog");
    if (log) {
      const lineLog = document.createElement("div");
      lineLog.textContent = `[${new Date().toLocaleTimeString()}] ❌ ${d.label} інфузія зупинена`;
      log.prepend(lineLog);
    }

    line.remove();
  });
  line.appendChild(leftSide);
  line.appendChild(rightSide);

  const log = document.getElementById("drugInfLog");
  log.prepend(line);
}

function startInfusion(key, dose, unit, dilution = "1/50") {
  const d = DRUGS_INF[key];
  if (!d) { console.warn("Infusion drug not found:", key); return; }

  if (infusions[key]) stopInfusion(key);

  const interval = 1000; // щосекунди
  const intervalId = setInterval(() => {
    giveInfusionTick(key, dose, unit, dilution);
  }, interval);

  infusions[key] = { intervalId, dose, unit, dilution };
  if (typeof d.apply === "function" && d.apply().onStart) d.apply().onStart();
  console.log(`💧 Інфузія ${key} (${dilution}) розпочата зі швидкістю ${dose} ${unit}`);
}


function giveInfusionTick(key, rate, unit, dilution = "1/50") {
  const d = DRUGS_INF[key];
  if (!d) { console.warn("Unknown infusion drug:", key); return; }

  const currState = (typeof getState === "function") ? getState() : null;
  const effect = d.apply(Number(rate) || 0, unit, currState, dilution);
  if (!effect) { console.warn("No infusion effect returned for:", key); return; }

  const t0 = nowSec();
  const toTau = (hl) => (hl ? (hl / Math.LN2) : null);

  // якщо задані decayHalfLifeSec — використовуємо їх як дефолт для інфузії
  const tauGlobal = effect.tauSec ?? toTau(effect.halfLifeSec) ?? 5;
  const tauHr     = effect.hrTauSec ?? toTau(effect.hrHalfLifeSec ?? effect.decayHalfLifeSec) ?? tauGlobal;
  const tauBp     = effect.bpTauSec ?? toTau(effect.bpHalfLifeSec ?? effect.decayHalfLifeSec) ?? tauGlobal;
  const shape     = effect.shape || "exp";

  activeDrugEffects.push({ t0, effect, tauHr, tauBp, shape });
}

function stopInfusion(key) {
  const d = DRUGS_INF[key] || DRUGS[key];
  if (!d) return;

  const inf = infusions[key];
  if (inf?.intervalId) clearInterval(inf.intervalId);

  // знімаємо ВСІ ефекти з цим label
  for (let i = activeDrugEffects.length - 1; i >= 0; i--) {
    const eff = activeDrugEffects[i]?.effect;
    if (eff?.label === d.label) {
      if (typeof eff.onStop === "function") eff.onStop();
      activeDrugEffects.splice(i, 1);
    }
  }

  delete infusions[key];
}


  // ==== DRUG UI set up Infuzomat
(function setupDrugInfUi(){
  const sel = document.getElementById("drugInfSelect");
  const unitSel = document.getElementById("drugInfUnit");
  const dilutionUnit = document.getElementById("dilutionUnit"); 
  const doseInput = document.getElementById("drugInfDose");
  const btnGive = document.getElementById("drugInfGive");

  if (!sel || !unitSel || !doseInput || !btnGive ) return;

  // заповнюємо список препаратів
  Object.entries(DRUGS_INF).forEach(([key, d]) => {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = d.label;
    sel.appendChild(opt);
  });

  function refreshUnits() {
  unitSel.innerHTML = "";
  const d = DRUGS_INF[sel.value];
  if (!d) return;

  d.units.forEach(u => {
    const o = document.createElement("option"); o.value = o.textContent = u;
    unitSel.appendChild(o);
  });
  unitSel.value = d.defaultUnit || d.units[0];

  if (dilutionUnit) {
    dilutionUnit.innerHTML = ""; // ВАЖЛИВО: очистити
    (d.unitsDealution || []).forEach(u => {
      const o = document.createElement("option"); o.value = o.textContent = u;
      dilutionUnit.appendChild(o);
    });
    if (dilutionUnit.options.length) {
      dilutionUnit.value = dilutionUnit.options[0].value;
    }
  }
}


  sel.addEventListener("change", refreshUnits);
  refreshUnits();
  
  btnGive.addEventListener("click", () => {
  const dose = parseFloat(doseInput.value);
  if (!isFinite(dose) || dose <= 0) { alert("Вкажи коректну дозу > 0"); return; }
  createInfuzomat(DRUGS_INF[sel.value], dose, sel, unitSel, dilutionUnit); // ⟵ додали dilutionUnit
});

    })();

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
      refreshAbpScale(); prefill(); redrawAbpNow();
    };

    el.bpm.addEventListener("input", (e) => {
      state.bpm = +e.target.value;
      bpmBaseline = state.bpm;
      el.bpmVal.textContent = state.bpm;
      phaseAtFn = makePhaseFn(state);       // важливо!
      updateEcgModel(state);
      prefill(); updateKpis();
    });

    el.duration.addEventListener("input", (e) => {
      state.duration = +e.target.value; el.durVal.textContent = state.duration;
      xTimeE.domain([-state.duration, 0]); xTimeA.domain([-state.duration, 0]);
      resetBuffers(); prefill(); drawAxes(); redrawEcgNow(); redrawAbpNow();
    });

    el.fs.addEventListener("change", (e) => {
      state.fs = +e.target.value; setAbpFs(state.fs);
      resetBuffers(); prefill(); redrawEcgNow(); redrawAbpNow();
    });

    el.ecgAmp.addEventListener("input", (e) => {
      state.ecgAmp = +e.target.value; el.ecgAmpVal.textContent = state.ecgAmp.toFixed(2);
    });

    const updateAndPrefill = () => { updateEcgModel(state); prefill(); };
    ["input","change"].forEach((ev) => {
      el.pAmp.addEventListener(ev, (e)=>{ state.pAmp = +e.target.value; });
      el.qAmp.addEventListener(ev, (e)=>{ state.qAmp = +e.target.value; });
      el.rAmp.addEventListener(ev, (e)=>{ state.rAmp = +e.target.value; });
      el.sAmp.addEventListener(ev, (e)=>{ state.sAmp = +e.target.value; });
      el.tAmp.addEventListener(ev, (e)=>{ state.tAmp = +e.target.value; });

      el.pDur.addEventListener(ev, (e)=>{ state.pDur = +e.target.value; updateAndPrefill(); });
      el.prSeg.addEventListener(ev, (e)=>{ state.prSeg = +e.target.value; updateAndPrefill(); });
      el.qrsDur.addEventListener(ev, (e)=>{ state.qrsDur = +e.target.value; updateAndPrefill(); });
      el.stSeg.addEventListener(ev, (e)=>{ state.stSeg = +e.target.value; updateAndPrefill(); });
      el.tDur.addEventListener(ev, (e)=>{ state.tDur = +e.target.value; updateAndPrefill(); });
      el.tpDur.addEventListener(ev, (e)=>{ state.tpDur = +e.target.value; updateAndPrefill(); });
      el.autoTP.addEventListener(ev, (e)=>{ state.autoTP = e.target.checked; updateAndPrefill(); });

      el.prLvl.addEventListener(ev, (e)=>{ state.prLevel = +e.target.value; prefill(); });
      el.stLvl.addEventListener(ev, (e)=>{ state.stLevel = +e.target.value; prefill(); });
      el.tpLvl.addEventListener(ev, (e)=>{ state.tpLevel = +e.target.value; prefill(); });
    });

    // ABP
    el.sys.addEventListener("input", (e)=>{ state.sys = +e.target.value; syncSysUI(); afterSysDiaChange(); });
    el.sysN.addEventListener("input", (e)=>{ state.sys = +e.target.value; syncSysUI(); afterSysDiaChange(); });
    el.dia.addEventListener("input", (e)=>{ state.dia = +e.target.value; syncDiaUI(); afterSysDiaChange(); });
    el.diaN.addEventListener("input", (e)=>{ state.dia = +e.target.value; syncDiaUI(); afterSysDiaChange(); });
    el.spo2.addEventListener("input", (e)=>{ state.spo2 = +e.target.value; syncSpO2UI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.spo2N.addEventListener("input", (e)=>{ state.spo2 = +e.target.value; syncSpO2UI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.pi.addEventListener("input", (e)=>{ state.pi = +e.target.value; syncPiUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.piN.addEventListener("input", (e)=>{ state.pi = +e.target.value; syncPiUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.tof.addEventListener("input", (e)=>{ state.tof = +e.target.value; syncTofUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.tofN.addEventListener("input", (e)=>{ state.tof = +e.target.value; syncTofUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.bis.addEventListener("input", (e)=>{ state.bis = +e.target.value; syncBisUI(); updateMonitorUI(measSys, measDia, measMap, state); });
    el.bisN.addEventListener("input", (e)=>{ state.bis = +e.target.value; syncBisUI(); updateMonitorUI(measSys, measDia, measMap, state); });

    el.notchPos.addEventListener("input", (e)=>{ state.notchPos = +e.target.value; el.notchPosVal.textContent = state.notchPos.toFixed(2); });
    el.notchDepth.addEventListener("input", (e)=>{ state.notchDepth = +e.target.value; el.notchDepthVal.textContent = state.notchDepth.toFixed(2); });
    el.damp.addEventListener("input", (e)=>{ state.damping = +e.target.value; el.dampVal.textContent = state.damping.toFixed(2); });
    el.aug.addEventListener("input", (e)=>{ state.aug = +e.target.value; el.augVal.textContent = state.aug.toFixed(2); });
    el.tau.addEventListener("input", (e)=>{ state.tauRel = +e.target.value; el.tauVal.textContent = state.tauRel.toFixed(2); });
    el.emd.addEventListener("input", (e)=>{ state.emdMs = +e.target.value; el.emdVal.textContent = state.emdMs; updateKpis(); });
    el.ptt.addEventListener("input", (e)=>{ state.pttMs = +e.target.value; el.pttVal.textContent = state.pttMs; updateKpis(); });

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
      el.scenarioSelect.addEventListener("change", (e) => applyScenario(e.target.value));
    }
    if (el.btnVF) el.btnVF.addEventListener("click", () => applyScenario("vf"));

    // первинний синк KPI
    if (el.bpmVal) el.bpmVal.textContent = Math.round(state.bpm);
    if (el.durVal) el.durVal.textContent = state.duration;
    if (el.ecgAmpVal) el.ecgAmpVal.textContent = state.ecgAmp.toFixed(2);
    syncSysUI(); syncDiaUI(); syncSpO2UI(); syncPiUI(); syncTofUI(); syncBisUI();
  };

  // ---------------- Apply scenario ----------------
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
    // --- FORCE SCENARIO HR/BP ---
    if (EXACT_SCENARIO_MODE) {
        smoothHR = state.bpm;     // lock heart rate
        __lastAppliedBpm = state.bpm;
    }
    renderClinicalCaseForScenario(key);  
    // оновити фазову функцію під новий стан
    phaseAtFn = makePhaseFn(getState());

    xTimeE.domain([-state.duration, 0]);
    xTimeA.domain([-state.duration, 0]);
    tClock = 0; acc = 0; lastTick = null;

    resetBuffers();
    afReset();
    avb_lastPhase = null; avb_t = 0;

    updateEcgModel(state);
    prefill();
    refreshAbpScale();
    redrawEcgNow();

    measSys = Math.round(state.sys);
    measDia = Math.round(state.dia);
    measMap = Math.round((measSys + 2 * measDia) / 3);
    updateMonitorUI(measSys, measDia, measMap, state);
    updateKpis();
    renderClinicalCaseForScenario(key);

    if (document && document.body) document.body.dataset.scenario = key;
    if (el.toggle) el.toggle.textContent = state.playing ? "Pause" : "Play";
    if (!skipUiSync && el.scenarioSelect) el.scenarioSelect.value = key;
  };

  if (typeof window !== "undefined") window.__ECG_applyScenario = (n, o) => applyScenario(n, o);

  // ---------------- Resize ----------------
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

  // ---------------- Animation ----------------

const frame = (ts) => {
  if (!state.playing) { lastTick = ts; return; }
  if (lastTick == null) lastTick = ts;

  const dt = Math.max(0, (ts - lastTick) / 1000);
  lastTick = ts;
  acc += dt;

  const toGen = Math.floor(acc * state.fs);
  if (toGen <= 0) return;

  const step = 1 / state.fs;

for (let k = 0; k < toGen; k++) {
    tClock += step;

    // ---------------------------
    // (1) Compute current drug effects
    // ---------------------------
    const eff = computeEffectiveVitals(state);

    // ---------------------------
    // (2) HR update — SCENARIO-LOCKED MODE
    // ---------------------------
    if (!EXACT_SCENARIO_MODE) {
        // Normal mode: smooth, drug-modified HR
        const targetHR = clamp(eff.bpmEff, 20, 220);
        const alphaHR = 1 - Math.exp(-step / TAU_HR);
        smoothHR = smoothHR + alphaHR * (targetHR - smoothHR);

        const now = performance.now() / 1000;
        if (__lastAppliedBpm == null) __lastAppliedBpm = smoothHR;

        if (Math.abs(smoothHR - __lastAppliedBpm) >= 0.3 || (now - __lastBpmRebuildAt) > 0.5) {
            state.bpm = Math.round(smoothHR);
            __lastAppliedBpm = smoothHR;
            __lastBpmRebuildAt = now;

            if (el?.bpm)    el.bpm.value = state.bpm;
            if (el?.bpmVal) el.bpmVal.textContent = state.bpm;

            // Rebuild model & phase function using updated bpm
            phaseAtFn = makePhaseFn({ ...state, bpm: smoothHR, pac: state.pac });
            updateEcgModel({ ...state, bpm: smoothHR });
        }
    } else {
        // EXACT mode: SCENARIO BPM ALWAYS WINS
        smoothHR = state.bpm;

        // make sure phase generator is scenario-consistent
        phaseAtFn = makePhaseFn(state);
    }

    // ---------------------------
    // (3) ECG & ABP phases
    // ---------------------------
    const delay = (state.emdMs + state.pttMs) / 1000;
    const phaseE = phaseAtFn(tClock / 3);
    const phaseA = phaseAtFn(tClock / 3 - delay);

    // ---------------------------
    // (4) ECG waveform (scenario-based)
    // ---------------------------
    const ecg = 3 * ecgAtPhase(phaseE, state) + (Math.random() * 2 - 1) * 0.01;

    // ---------------------------
    // (5) ABP vitals — SCENARIO-LOCKED MODE
    // ---------------------------
    const sEffForAbp = EXACT_SCENARIO_MODE
        ? state   // scenario's SYS/DIA
        : (eff.sysEff !== state.sys || eff.diaEff !== state.dia)
            ? { ...state, sys: eff.sysEff, dia: eff.diaEff }
            : state;

    const abpRaw = pressureAtPhase(phaseA, sEffForAbp);
    const g = Math.max(0, Math.min(1, state.abpGain ?? 1));
    const abp = sEffForAbp.dia + (abpRaw - sEffForAbp.dia) * g;

    // ---------------------------
    // (6) Push to circular buffers
    // ---------------------------
    ecgBuf[head] = ecg;
    abpBuf[head] = abp;
    head = (head + 1) % bufLen;

    // ---------------------------
    // (7) Beat-by-beat measurement
    // ---------------------------
    if (abp < beatMin) beatMin = abp;
    if (abp > beatMax) beatMax = abp;
    beatSum += abp; 
    beatCount++;

    if (prevPhaseA !== null && phaseA < prevPhaseA) {

        if (EXACT_SCENARIO_MODE) {
            // Force scenario-defined vitals
            measSys = Math.round(state.sys);
            measDia = Math.round(state.dia);
            measMap = Math.round((state.sys + 2 * state.dia) / 3);
        } else {
            // Normal physiology mode
            measSys = Math.round(beatMax);
            measDia = Math.round(beatMin);
            measMap = Math.round(beatSum / Math.max(1, beatCount));
        }

        updateMonitorUI(measSys, measDia, measMap, sEffForAbp);
        updateKpis();

        beatMin = 1e9; 
        beatMax = -1e9; 
        beatSum = 0; 
        beatCount = 0;
    }

    prevPhaseA = phaseA;
}


  acc -= toGen * step;

  // 7) перемальовування
  redrawEcgNow();
  redrawAbpNow();
};



  d3.timer(frame);

  // ---------------- Go! ----------------
  setupControls();
  applyScenario("vf", { skipUiSync: false }); // автозапуск VF
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
// ====== НАВЧАЛЬНІ ПРЕПАРАТИ (спрощена фармакодинаміка) ======

// Корисні утиліти
const clampNum = (x, a, b) => Math.max(a, Math.min(b, x));
const nowSec = () => performance.now() / 1000;

// Форма імпульсу ефекту: миттєвий підйом → експоненційне згасання

// Стане (додаємо підтримку різних форм):
function pulseStrength(t, tau, shape = "exp") {
  if (t < 0) return 0;
  const T = Math.max(0.1, tau);
  if (shape === "exp") return Math.exp(-t / T);

  // М’якіший «довгий хвіст»
  if (shape === "biexp") {
    const a = 0.7;                   // частка «швидкої» компоненти
    const tau1 = 0.5 * T;            // швидка
    const tau2 = 2.0 * T;            // повільна
    return a * Math.exp(-t / tau1) + (1 - a) * Math.exp(-t / tau2);
  }

  // Fallback
  return Math.exp(-t / T);
}

// Опис ефектів:
// кожен apply(dose, unit) повертає { durationSec, hrMul, hrAdd, sysAdd, diaAdd }
const DRUGS = {

adrenaline: {
  label: "Адреналін (IV болюс)",
  units: ["ml","µg","mg"],          // ⟵ додали "ml"
  defaultUnit: "ml",
  apply(dose, unit, state, dilution) {
    // якщо користувач вводить в мл із заданим розведенням — використовуємо твої правила
    if (unit === "ml" && dilution) {
      const vol = Math.max(0, Number(dose) || 0); // мл
      const pickInt = (a,b) => Math.floor(a + Math.random()*(b-a+1));

      let hrAddPerMl = 0, sysAddPerMl = 0, hold=8, riseHL=2, bpHL=25, hrHL=25;

      if (dilution === "1:1000") {
        hrAddPerMl  = pickInt(7,10);
        sysAddPerMl = 5;
        hold = 6; riseHL = 2; hrHL = 20; bpHL = 20;
      } else if (dilution === "1:100") {
        hrAddPerMl  = pickInt(15,20);
        sysAddPerMl = 20;
        hold = 8; riseHL = 2; hrHL = 25; bpHL = 25;
      } else if (dilution === "1:10") {
        hrAddPerMl  = 40;
        sysAddPerMl = 80;
        hold = 10; riseHL = 1.5; hrHL = 35; bpHL = 35;
      }

      const hrAdd  = hrAddPerMl  * vol;
      const sysAdd = sysAddPerMl * vol;

      return {
        // ефект
        hrMul: 1.0,
        hrAdd,
        sysAdd,
        diaAdd: 0,                // за бажанням можна зробити, напр., Math.round(sysAdd*0.5)

        // кінетика
        riseHalfLifeSec: riseHL,  // швидкість настання
        holdSec: hold,            // коротке плато
        hrHalfLifeSec: hrHL,      // спад ЧСС
        bpHalfLifeSec: bpHL,      // спад АТ
        shape: "exp"
      };
    }

    // Інакше — зберігаємо попередню логіку по µg/mg (сумісність + сценарій асистолії)
    const ug = unit === "mg" ? (Number(dose) || 0) * 1000 : (Number(dose) || 0);
    const x  = clampNum(ug / 100, 0, 3);
    const baseEffect = {
      durationSec: 60,
      hrMul: 1 + 0.35 * x,
      hrAdd: 0,
      sysAdd: +25 * x,
      diaAdd: +12 * x,
    };
    const isAsystole =
      state?.scenario === "asystole" ||
      state?.ecgMode === "flatline" ||
      state?.abpMode === "flatline";
    if (!isAsystole) return baseEffect;

    return {
      ...baseEffect,
      onApply() {
        if (typeof window !== "undefined" && typeof window.__ECG_applyScenario === "function") {
          window.__ECG_applyScenario("sinus_brady_mild", { skipUiSync: false });
          const st = (typeof getState === "function") ? getState() : null;
          if (st) { st.sys = Math.max(st.dia + 5, 90); st.dia = Math.max(50, Math.min(st.sys - 5, 65)); }
        }
      },
      durationSec: 2,
      halfLifeSec: 2,
      hrHalfLifeSec: 2,
      bpHalfLifeSec: 2,
      shape: "exp",
      hrMul: 1 + 0.05 * x,
      sysAdd: +18 * x,
      diaAdd: +10 * x,
    };
  },
},



    atropine: {
    label: "Атропін (IV)",
    units: ["mg"],
    defaultUnit: "mg",
    // dose, unit, state — state потрібен для оцінки поточного ефективного ЧСС
    apply(dose, unit, state) {
      const mg = Number(dose) || 0;
      const low = mg <= 0.5;

      // Поточний ЕФЕКТИВНИЙ ЧСС з урахуванням попередніх ефектів
      const bpmNow = (state && typeof computeEffectiveVitals === "function")
        ? computeEffectiveVitals(state).bpmEff
        : (state?.bpm ?? 60);

      let hrAdd;
      if (low) {
        // браді: −30, але не нижче 20/хв
        const roomDown = Math.max(0, bpmNow - 20);
        hrAdd = -Math.min(30, roomDown);
      } else {
        // тахі: +60, але не вище 220/хв
        const roomUp = Math.max(0, 220 - bpmNow);
        hrAdd = +Math.min(60, roomUp);
      }

      return {
        durationSec: 45, // тривалість ефекту, експоненційно згасає
        hrMul: 0.5,        // множник не чіпаємо
        hrAdd,           // розрахований зсув, без «пробою» 20..220
        sysAdd: 0,
        diaAdd: 0,
      };
    },
  },



  phenyl: {
    label: "Фенілeфрин (IV болюс)",
    units: ["µg"],
    defaultUnit: "µg",
    apply(dose, unit) {
      const ug = dose;
      const y = clampNum(ug / 100, 0, 3);
      return {
        durationSec: 40,
        hrMul: 1 - 0.20 * y, // рефлекторна брадикардія
        hrAdd: 0,
        sysAdd: +30 * y,
        diaAdd: +18 * y,
      };
    },
  },

  esmolol: {
    label: "Метопролол",
    units: ["mg"],
    defaultUnit: "mg",
    apply(dose, unit) {
      const mg = dose;
      const y = clampNum(mg / 50, 0, 2);
      return {
        durationSec: 120,
        hrMul: 1 - 0.3 * y, // брадикардія
        hrAdd: 0,
        sysAdd: -10 * y,     // невелике зниження АТ
        diaAdd: -8 * y,
      };
    },
  },

  adenosine: {
    label: "Аденозин (IV болюс)",
    units: ["mg"],
    defaultUnit: "mg",
    apply(dose, unit) {
      const mg = dose;
      const y = clampNum(mg / 6, 0, 2); // 6 мг як «еталон»
      return {
        durationSec: 6,          // дуже коротко
        hrMul: 0.10,             // майже пауза / AV-блок
        hrAdd: 0,
        sysAdd: -5 * y,
        diaAdd: -4 * y,
      };
    },
  },

  nitro: {
    label: "Нітрогліцерин (IV болюс)",
    units: ["µg"],
    defaultUnit: "µg",
    apply(dose, unit) {
      const ug = dose;
      const y = clampNum(ug / 200, 0, 3);
      return {
        durationSec: 60,
        hrMul: 1 + 0.08 * y, // невелика рефлекторна тахі
        hrAdd: 0,
        sysAdd: -25 * y,     // вазодилатація → ↓АТ
        diaAdd: -15 * y,
      };
    },
  },
};
const BOLUS_DRUGS = {
  atropine: {
    label: "Атропін",
    dilutions: [
      { id: "1mg/10ml", mg_per_ml: 0.1 } // 0.1 мг в 1 мл
    ],
    effect(mg, state) {
      // <0.5 мг → браді
      if (mg < 0.5) {
        return {
          hr: 30,
          sys: state.sys - 5,
          dia: state.dia - 2
        };
      }
      // ≥0.5 мг → +60 до поточного
      return {
        hr: state.hr + 60,
        sys: state.sys + 10,
        dia: state.dia + 5
      };
    }
  },

  adrenaline: {
    label: "Адреналін",
    dilutions: [
      { id: "1:1000", mg_per_ml: 1.0 },   // 1 мг/мл
      { id: "1:100", mg_per_ml: 0.1 },    // 0.1 мг/мл
      { id: "1:10", mg_per_ml: 0.01 },    // 0.01 мг/мл
    ],
    effect(mg, state) {
      // Ефект залежить від дози
      const x = mg;

      if (state.scenario === "asystole" && mg >= 1) {
        // Перевести асистолію → браді-синус
        return {
          scenario: "baseline",
          hr: 40,
          sys: 80,
          dia: 40
        };
      }

      return {
        hr: state.hr + Math.round(20 * x),
        sys: state.sys + Math.round(15 * x),
        dia: state.dia + Math.round(7 * x)
      };
    }
  },

  phenylephrine: {
    label: "Фенілефрин",
    dilutions: [
      { id: "1:100", mg_per_ml: 0.1 },    // 0.1 мг/мл
      { id: "1:10", mg_per_ml: 1.0 },     // 1 мг/мл
    ],
    effect(mg, state) {
      return {
        hr: state.hr - Math.round(2 * mg),  // рефлекторна браді
        sys: state.sys + Math.round(20 * mg),
        dia: state.dia + Math.round(10 * mg)
      };
    }
  },

  ebrantil: {
    label: "Ебрантіл (урапідил)",
    dilutions: [
      { id: "5mg/ml", mg_per_ml: 5 }
    ],
    effect(mg, state) {
      return {
        hr: state.hr,
        sys: state.sys - Math.round(10 * mg),
        dia: state.dia - Math.round(6 * mg)
      };
    }
  }
};

const DRUGS_INF = {
  adrenaline: {
    label: "Адреналін (інфузія)",
    units: ["µg/min", "mg/h"],
    unitsDealution :["5/50", "1/50"],
    defaultUnit: "µg/min",
    
    apply(rate, unit, state, dilution = "5/50") {
      // Parse dilution, e.g. "5/50" → doseFactor = 5 / 50
      const [drugMg, volumeMl] = dilution.split("/").map(Number);
      const doseFactor = drugMg / volumeMl || 0.1; // fallback

      // Convert infusion rate to µg/min
      const ugPerMin =
        unit === "mg/h" ? (Number(rate) || 0) * 1000 / 60 : (Number(rate) || 0);

      // Adjust effect depending on dilution strength
      // Higher concentration (like 5/50) → stronger per µg/min
      const potencyAdj = doseFactor / 0.1; // 0.1 is reference (1/50)
      const x = clampNum((ugPerMin / 100) * potencyAdj, 0, 3); 

      return {
        durationSec: Infinity,
        hrMul: 1 + 0.15 * x,
        hrAdd: 0,
        sysAdd: +15 * x,
        diaAdd: +7 * x,
        decayHalfLifeSec: 30,
        onStart() {
          console.log(`✅ Адреналін інфузія (${dilution}) почалася`);
        },
        onStop() {
          console.log("🛑 Адреналін інфузія припинена (ефект згасає)");
        },
      };
    },
  },
};

// Стан/журнал ефектів
let infusions = {};
const activeDrugEffects = []; // масив { t0, tau, effect }

function giveDrugAndLog(key, dose, unit, isConstant = false, dilution = null) {
  const d = DRUGS[key];
  if (!d) { console.warn("Unknown bolus drug:", key); return; }

  const currState = (typeof getState === "function") ? getState() : null;
  const effect = d.apply(Number(dose) || 0, unit, currState, dilution);
  if (!effect) { console.warn("No effect returned for bolus:", key); return; }

  if (typeof effect.onApply === "function") effect.onApply(currState);

  const t0 = nowSec();
  const toTau = (hl) => (hl ? (hl / Math.LN2) : null);

  const tauGlobal = effect.tauSec ?? toTau(effect.halfLifeSec) ?? ((effect.durationSec || 30) / 2);
  const tauHr     = effect.hrTauSec ?? toTau(effect.hrHalfLifeSec) ?? tauGlobal;
  const tauBp     = effect.bpTauSec ?? toTau(effect.bpHalfLifeSec) ?? tauGlobal;
  const shape     = effect.shape || "exp";

  activeDrugEffects.push({ t0, effect, tauHr, tauBp, shape });

  const log = isConstant ? document.getElementById("drugInfLog") : document.getElementById("drugLog");
  if (log) {
    const line = document.createElement("div");
    if (!isConstant) line.textContent = `[${new Date().toLocaleTimeString()}] ${d.label}: ${dose} ${unit}${dilution ? ` (${dilution})` : ""}`;
    log.prepend(line);
  }
  if (typeof prefill === "function") { prefill(); redrawEcgNow(); redrawAbpNow(); }
}



// Агрегація активних ефектів у модифікатори HR/BP
function getDrugModifiers() {
  const t = nowSec();
  let hrMul = 1.0, hrAdd = 0.0, sysAdd = 0.0, diaAdd = 0.0;

  for (let i = activeDrugEffects.length - 1; i >= 0; i--) {
    const e = activeDrugEffects[i];
    const { t0, effect, tauHr, tauBp, shape } = e;
    const dt = t - t0;

    // окремі згасання для HR та BP
    const sHr = pulseStrength(dt, tauHr, shape);
    const sBp = pulseStrength(dt, tauBp, shape);

    // прибираємо, якщо вже «зникло» майже повністю
    if (Math.max(sHr, sBp) <= 0.003) { activeDrugEffects.splice(i, 1); continue; }

    hrMul *= (effect.hrMul ?? 1) ** sHr;
    hrAdd += (effect.hrAdd ?? 0) * sHr;

    sysAdd += (effect.sysAdd ?? 0) * sBp;
    diaAdd += (effect.diaAdd ?? 0) * sBp;
  }
  return { hrMul, hrAdd, sysAdd, diaAdd };
}



// Допоміжні «ефективні» значення (викор. у кадрі)
function computeEffectiveVitals(state, baseHROverride) {
  const { hrMul, hrAdd, sysAdd, diaAdd } = getDrugModifiers();
  const baseHR = (typeof baseHROverride === "number" ? baseHROverride : (state.bpm || 60));
  const bpmEff = clampNum(baseHR * hrMul + hrAdd, 20, 220);
  const sysEff = clampNum((state.sys || 120) + sysAdd, 40, 260);
  const diaEff = clampNum((state.dia || 70)  + diaAdd, 20, Math.min(sysEff - 1, 160));
  return { bpmEff, sysEff, diaEff };
}

