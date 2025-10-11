// static/ECG_display/js/ui/rendering.js

// Створюємо шляхи для ЕКГ та АТ і повертаємо селектори
export const setupTraces = (traceE, traceA) => {
  const ecgIso = traceE
    .append("path")
    .attr("class", "iso ecg-iso")
    .attr("fill", "none")
    .attr("stroke", "#bbb")
    .attr("stroke-width", 1);

  const ecgPath = traceE
    .append("path")
    .attr("class", "wave ecg")
    .attr("fill", "none")
    .attr("stroke", "#e53935")
    .attr("stroke-width", 1.6);

  const abpIso = traceA
    .append("path")
    .attr("class", "iso abp-iso")
    .attr("fill", "none")
    .attr("stroke", "#bbb")
    .attr("stroke-width", 1);

  const abpPath = traceA
    .append("path")
    .attr("class", "wave abp")
    .attr("fill", "none")
    .attr("stroke", "#1e88e5")
    .attr("stroke-width", 1.6);

  return { ecgPath, abpPath, ecgIso, abpIso };
};

// Допоміжне: розмотуємо циклічний буфер у «пряму» послідовність
const buildSeries = (buf, head) => {
  const n = buf.length;
  const out = new Array(n);
  let k = 0;
  for (let i = head; i < n; i++) out[k++] = buf[i];
  for (let i = 0; i < head; i++) out[k++] = buf[i];
  return out;
};

// Перемальовка ЕКГ
export const redrawECG = (buf, head, bufLen, idxToX, yScale, pathSel, isoSel, W, H) => {
  const data = buildSeries(buf, head);
  const line = d3
    .line()
    .x((d, i) => idxToX(i, data.length))
    .y((d) => yScale(d));
  pathSel.attr("d", line(data));
  // ізолінія 0 мВ
  const y0 = yScale(0);
  isoSel.attr("d", `M0,${y0}L${W},${y0}`);
};

// Перемальовка АТ
export const redrawABP = (buf, head, bufLen, idxToX, yScale, pathSel, isoSel, W, H) => {
  const data = buildSeries(buf, head);
  const line = d3
    .line()
    .x((d, i) => idxToX(i, data.length))
    .y((d) => yScale(d));
  pathSel.attr("d", line(data));
  // ізолінія 0 мм рт. ст.
  const y0 = yScale(0);
  isoSel.attr("d", `M0,${y0}L${W},${y0}`);
};
