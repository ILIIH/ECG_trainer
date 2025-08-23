function ecgWaveform(p) {
  // centers (as fraction of RR interval) and amplitudes (mV) for P, Q, R, S, T
  const comps = [
    { a: 0.12, mu: 0.2, sig: 0.025 }, // P
    { a: -0.25, mu: 0.375, sig: 0.01 }, // Q
    { a: 1.0, mu: 0.4, sig: 0.012 }, // R
    { a: -0.35, mu: 0.43, sig: 0.01 }, // S
    { a: 0.3, mu: 0.7, sig: 0.035 }, // T
  ];
  let v = 0;
  for (const c of comps) {
    const d = p - c.mu;
    v += c.a * Math.exp((-0.5 * (d * d)) / (c.sig * c.sig));
  }
  // slight isoelectric drift within a beat
  v += 0.02 * Math.sin(2 * Math.PI * p);
  return v;
}

function generateEcg({ bpm = 60, duration = 10, fs = 500, amp = 1.0 }) {
  const n = Math.max(10, Math.floor(duration * fs));
  const dt = 1 / fs;
  const rr = 60 / bpm; // seconds per beat
  const wanderFreq = 0.2; // Hz (baseline wander)
  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const phase = (t % rr) / rr; // 0..1
    // main ECG
    let v = amp * ecgWaveform(phase);
    result[i] = { t, v };
  }
  return result;
}

// --- D3 chart setup ---
const margin = { top: 16, right: 20, bottom: 34, left: 46 };
const width = document.querySelector("#chart").clientWidth || 900;
const height = 420;

const svg = d3
  .select("#chart")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const innerW = width - margin.left - margin.right;
const innerH = height - margin.top - margin.bottom;

const g = svg
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleLinear().range([0, innerW]);
const y = d3.scaleLinear().range([innerH, 0]);

const grid = g.append("g").attr("class", "grid");
const axisX = g
  .append("g")
  .attr("transform", `translate(0,${innerH})`)
  .attr("class", "axisX");
const axisY = g.append("g").attr("class", "axisY");

const path = g
  .append("path")
  .attr("fill", "none")
  .attr(
    "stroke",
    getComputedStyle(document.documentElement).getPropertyValue("--line")
  )
  .attr("stroke-width", 2.2)
  .attr("stroke-linejoin", "round")
  .attr("stroke-linecap", "round");

const line = d3
  .line()
  .x((d) => x(d.t))
  .y((d) => y(d.v));

// --- Render Functions ---
function renderFull(data) {
  const tMax = d3.max(data, (d) => d.t);
  x.domain([0, tMax]);
  const yPad = 0.2;
  const vMin = Math.min(-1.5, d3.min(data, (d) => d.v) - yPad);
  const vMax = Math.max(1.5, d3.max(data, (d) => d.v) + yPad);
  y.domain([vMin, vMax]);

  // Clear grid
  grid.selectAll("*").remove();

  const smallStepX = 0.04; // 40 ms
  const bigStepX = 0.2; // 200 ms
  const smallStepY = 0.1; // 0.1 mV
  const bigStepY = 0.5; // 0.5 mV

  // Vertical small grid
  for (let tx = 0; tx <= tMax + 1e-6; tx += smallStepX) {
    grid
      .append("line")
      .attr("x1", x(tx))
      .attr("x2", x(tx))
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", "rgba(76,201,240,0.06)");
  }
  // Horizontal small grid
  for (
    let vy = Math.ceil(y.domain()[0] / smallStepY) * smallStepY;
    vy <= y.domain()[1] + 1e-6;
    vy += smallStepY
  ) {
    grid
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", y(vy))
      .attr("y2", y(vy))
      .attr("stroke", "rgba(76,201,240,0.06)");
  }
  // Big grid (bold lines)
  for (let tx = 0; tx <= tMax + 1e-6; tx += bigStepX) {
    grid
      .append("line")
      .attr("x1", x(tx))
      .attr("x2", x(tx))
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", "#223055");
  }
  for (
    let vy = Math.ceil(y.domain()[0] / bigStepY) * bigStepY;
    vy <= y.domain()[1] + 1e-6;
    vy += bigStepY
  ) {
    grid
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", y(vy))
      .attr("y2", y(vy))
      .attr("stroke", "#223055");
  }

  // Axes
  const ax = d3
    .axisBottom(x)
    .ticks(Math.min(10, Math.ceil(tMax / 0.2)))
    .tickSizeOuter(0)
    .tickFormat((d) => d + "s");
  const ay = d3
    .axisLeft(y)
    .ticks(8)
    .tickSizeOuter(0)
    .tickFormat((d) => d + " mV");

  axisX.call(ax).selectAll("text").attr("fill", "#c9d4ff");
  axisY.call(ay).selectAll("text").attr("fill", "#c9d4ff");
  axisX.selectAll("path,line").attr("stroke", "#30406b");
  axisY.selectAll("path,line").attr("stroke", "#30406b");

  // Initial full path
  path.datum(data).attr("d", line);
}

function updateLine(dataSlice) {
  path.datum(dataSlice).attr("d", line);
}

// --- UI wiring ---
const elBpm = document.getElementById("bpm");
const elDur = document.getElementById("duration");
const elAmp = document.getElementById("amp");
const elFs = document.getElementById("fs");
const elRegen = document.getElementById("regen");
const elPlay = document.getElementById("togglePlay");

const bpmVal = document.getElementById("bpmVal");
const durVal = document.getElementById("durVal");
const ampVal = document.getElementById("ampVal");

function params() {
  return {
    bpm: +elBpm.value,
    duration: +elDur.value,
    fs: +elFs.value,
    amp: +elAmp.value,
  };
}

function syncLabels() {
  bpmVal.textContent = elBpm.value;
  durVal.textContent = elDur.value;
  ampVal.textContent = (+elAmp.value).toFixed(2);
}

let data = generateEcg(params());
renderFull(data);

// Animation state
let playing = false;
let startTime = null;
let animationDuration = +elDur.value;

function tick(ts) {
  if (!playing) return;

  if (startTime === null) startTime = ts;

  const elapsed = (ts - startTime) / 1000; // seconds
  const p = params();
  animationDuration = p.duration;

  // Loop: progress in [0, duration]
  const progressTime = elapsed % animationDuration;

  // Slice data up to current time
  const dataSlice = data.filter((d) => d.t <= progressTime);

  updateLine(dataSlice);

  requestAnimationFrame(tick);
}

// Listeners
[elBpm, elDur, elAmp, elFs].forEach((el) =>
  el.addEventListener("input", () => {
    syncLabels();
  })
);

elRegen.addEventListener("click", () => {
  data = generateEcg(params());
  renderFull(data); // re-render full chart
});

elPlay.addEventListener("click", () => {
  playing = !playing;
  elPlay.textContent = playing ? "Pause" : "Play";
  if (playing) {
    startTime = null; // reset animation time
    requestAnimationFrame(tick);
  }
});

// Initial label sync
syncLabels();

// Responsive resize
window.addEventListener(
  "resize",
  d3.debounce(() => {
    const w = document.querySelector("#chart").clientWidth;
    svg.attr("viewBox", `0 0 ${w} ${height}`);
    // Optionally re-render on resize if scaling matters
    if (data) renderFull(data);
  }, 150)
);

// Debounce helper
d3.debounce = function (func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};
