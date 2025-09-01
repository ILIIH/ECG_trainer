// src/ui/charts.js
const ECG_HEIGHT = 260;
const ABP_HEIGHT = 260;
const margins = { top: 10, right: 40, bottom: 26, left: 44 };

export const setupCharts = (el, state) => {
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

  return {
    ecgY,
    abpY,
    xTimeE,
    xTimeA,
    gE,
    gA,
    ecgSvg,
    abpSvg,
    gridE: gE.append("g"),
    axesE: gE.append("g"),
    traceE: gE.append("g"),
    gridA: gA.append("g"),
    axesA: gA.append("g"),
    traceA: gA.append("g"),
    innerWEcg,
    innerHEcg,
    innerWAbp,
    innerHAbp,
    ECG_HEIGHT,
    ABP_HEIGHT,
    margins,
  };
};

export const drawGrid = (group, innerW, innerH) => {
  group.selectAll("*").remove();
  group
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", innerW)
    .attr("height", innerH)
    .attr("rx", 12)
    .attr("fill", "#0d1430");

  const minorStep = 5,
    majorStep = 25;
  for (let x = 0; x <= innerW; x += minorStep) {
    group
      .append("line")
      .attr("x1", x)
      .attr("y1", 0)
      .attr("x2", x)
      .attr("y2", innerH)
      .attr("stroke", "#223055")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", 0.5);
  }
  for (let y = 0; y <= innerH; y += minorStep) {
    group
      .append("line")
      .attr("x1", 0)
      .attr("y1", y)
      .attr("x2", innerW)
      .attr("y2", y)
      .attr("stroke", "#223055")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", 0.5);
  }
  for (let x = 0; x <= innerW; x += majorStep) {
    group
      .append("line")
      .attr("x1", x)
      .attr("y1", 0)
      .attr("x2", x)
      .attr("y2", innerH)
      .attr("stroke", "#223055")
      .attr("stroke-opacity", 0.7)
      .attr("stroke-width", 1);
  }
  for (let y = 0; y <= innerH; y += majorStep) {
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
};
