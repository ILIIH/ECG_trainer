// src/ui/monitor.js
export const setupMonitor = (gA, innerWAbp) => {
  const monitorG = gA.append("g").attr("class", "monitor");
  const artLabel = monitorG
    .append("text")
    .attr("class", "art")
    .attr("text-anchor", "end")
    .text("ART");
  const bpText = monitorG
    .append("text")
    .attr("class", "bp")
    .attr("text-anchor", "end")
    .text("120/70");
  const mapText = monitorG
    .append("text")
    .attr("class", "map")
    .attr("text-anchor", "end")
    .text("(87)");
  const spo2Line = monitorG
    .append("text")
    .attr("class", "sat")
    .attr("text-anchor", "end")
    .text("SpO₂ 98% (PI 3.2)");
  const tofLine = monitorG
    .append("text")
    .attr("class", "tof")
    .attr("text-anchor", "end")
    .text("TOF 4/4 90%");
  const bisLine = monitorG
    .append("text")
    .attr("class", "bis")
    .attr("text-anchor", "end")
    .text("BIS 60");

  const positionMonitor = () => {
    const x = innerWAbp - 12;
    artLabel.attr("x", x).attr("y", 14);
    bpText.attr("x", x).attr("y", 36);
    mapText.attr("x", x).attr("y", 52);
    spo2Line.attr("x", x).attr("y", 70);
    tofLine.attr("x", x).attr("y", 86);
    bisLine.attr("x", x).attr("y", 102);
  };

  const updateMonitor = (measSys, measDia, measMap, state) => {
    bpText.text(`${measSys}/${measDia}`);
    mapText.text(`(${measMap})`);
    spo2Line.text(
      `SpO₂ ${Math.round(state.spo2)}% (PI ${state.pi.toFixed(1)})`
    );
    tofLine.text(
      `TOF ${tofCountFromRatio(state.tof)}/4 ${Math.round(state.tof)}%`
    );
    bisLine.text(`BIS ${Math.round(state.bis)}`);

    const badBP =
      measSys >= 180 || measDia <= 40 || measMap < 60 || measMap > 120;
    const badSpO2 = state.spo2 < 90;
    const badBIS = state.bis < 40 || state.bis > 85;
    monitorG.classed("alert", badBP || badSpO2 || badBIS);
  };

  const tofCountFromRatio = (r) => {
    if (r >= 90) return 4;
    if (r >= 60) return 3;
    if (r >= 30) return 2;
    if (r >= 10) return 1;
    return 0;
  };

  return { updateMonitor, positionMonitor, tofCountFromRatio };
};
