// src/ui/rendering.js
export const setupTraces = (traceE, traceA) => {
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
    .style("filter", "drop-shadow(0 0 6px rgba(244,211,94,.35))");

  const ecgIso = traceE.append("line").attr("class", "iso");
  const abpIso = traceA.append("line").attr("class", "iso");

  return { ecgPath, abpPath, ecgIso, abpIso };
};

export const redrawECG = (
  ecgBuf,
  head,
  bufLen,
  idxToXecg,
  ecgY,
  ecgPath,
  ecgIso,
  innerWEcg,
  innerHEcg
) => {
  let dStr = "";
  for (let i = 0; i < bufLen; i++) {
    const x = idxToXecg(i, bufLen);
    const y = ecgY(ecgBuf[(head + i) % bufLen]);
    dStr += i === 0 ? `M${x},${y}` : `L${x},${y}`;
  }
  ecgPath.attr("d", dStr);
  ecgIso
    .attr("x1", 0)
    .attr("x2", innerWEcg)
    .attr("y1", ecgY(0))
    .attr("y2", ecgY(0));
};

export const redrawABP = (
  abpBuf,
  head,
  bufLen,
  idxToXabp,
  abpY,
  abpPath,
  abpIso,
  innerWAbp,
  innerHAbp
) => {
  let dStr = "";
  for (let i = 0; i < bufLen; i++) {
    const x = idxToXabp(i, bufLen);
    const y = abpY(abpBuf[(head + i) % bufLen]);
    dStr += i === 0 ? `M${x},${y}` : `L${x},${y}`;
  }
  abpPath.attr("d", dStr);
  abpIso
    .attr("x1", 0)
    .attr("x2", innerWAbp)
    .attr("y1", abpY(0))
    .attr("y2", abpY(0));
};
