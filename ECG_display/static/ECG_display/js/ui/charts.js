// static/ECG_display/js/ui/charts.js

export const CHART_SCALE = window.__CHART_SCALE || 1.35; // глобальний множник


export const setupCharts = (el, state) => {
  const ECG_HEIGHT = 180;
  const ABP_HEIGHT = 180;
  const margins = { top: 10, right: 10, bottom: 28, left: 32 };

  const widthEcg = el.ecgChart.node().clientWidth || 700;
  const widthAbp = el.abpChart.node().clientWidth || 700;

  let innerWEcg = widthEcg - margins.left - margins.right;
  let innerWAbp = widthAbp - margins.left - margins.right;
  let innerHEcg = ECG_HEIGHT - margins.top - margins.bottom;
  let innerHAbp = ABP_HEIGHT - margins.top - margins.bottom;

  // SVG ECG
  const ecgSvg = el.ecgChart
    .append("svg")
    .attr("viewBox", `0 0 ${widthEcg} ${ECG_HEIGHT}`)
    .attr("width", "100%")
    .attr("height", ECG_HEIGHT);
  const gE = ecgSvg
    .append("g")
    .attr("transform", `translate(${margins.left},${margins.top})`);

  // SVG ABP
  const abpSvg = el.abpChart
    .append("svg")
    .attr("viewBox", `0 0 ${widthAbp} ${ABP_HEIGHT}`)
    .attr("width", "100%")
    .attr("height", ABP_HEIGHT);
  const gA = abpSvg
    .append("g")
    .attr("transform", `translate(${margins.left},${margins.top})`);

  // шкали
  const xTimeE = d3.scaleLinear().domain([-state.duration, 0]).range([0, innerWEcg]);
  const xTimeA = d3.scaleLinear().domain([-state.duration, 0]).range([0, innerWAbp]);
  const ecgY   = d3.scaleLinear().domain([-2, 2]).range([innerHEcg, 0]);
  const abpY   = d3.scaleLinear().domain([0, Math.max(40, Math.max(state.sys, state.dia)) + 20]).range([innerHAbp, 0]);

  // шари
  const gridE = gE.append("g").attr("class", "grid");
  const axesE = gE.append("g").attr("class", "axes");
  const traceE = gE.append("g").attr("class", "traces");

  const gridA = gA.append("g").attr("class", "grid");
  const axesA = gA.append("g").attr("class", "axes");
  const traceA = gA.append("g").attr("class", "traces");

  return {
    ECG_HEIGHT, ABP_HEIGHT, margins,
    widthEcg, widthAbp,
    innerWEcg, innerHEcg, innerWAbp, innerHAbp,
    ecgSvg, abpSvg,
    gE, gA,
    xTimeE, xTimeA, ecgY, abpY,
    gridE, axesE, traceE,
    gridA, axesA, traceA,
  };
};

export const drawGrid = (g, W, H) => {
  g.selectAll("*").remove();
  const nx = 10, ny = 6;
  for (let i = 0; i <= nx; i++) {
    const x = (i / nx) * W;
    g.append("line")
      .attr("x1", x).attr("y1", 0).attr("x2", x).attr("y2", H)
      .attr("stroke", "#eee").attr("stroke-width", i % 5 === 0 ? 1.2 : 0.6);
  }
  for (let j = 0; j <= ny; j++) {
    const y = (j / ny) * H;
    g.append("line")
      .attr("x1", 0).attr("y1", y).attr("x2", W).attr("y2", y)
      .attr("stroke", "#eee").attr("stroke-width", j % 3 === 0 ? 1.2 : 0.6);
  }
};
