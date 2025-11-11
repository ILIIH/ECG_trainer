    // Simple 2D canvas plotter
function plethSample(t, spo2, hr, rhythm){
if (rhythm==='vf' || rhythm==='asystole') return 0.5 + 0.02*randn();
const rr = hr>0? 60/hr : 1.2; const phase=(t%rr)/rr;
let v = 0.45 + 0.35*Math.max(0, Math.sin(2*Math.PI*(phase-0.1)));
return Math.min(1, Math.max(0, v + 0.03*randn()));
}


function respSample(t){
return 0.5 + 0.2*Math.sin(2*Math.PI*(t/4)) + 0.02*randn();
}


const plots = {
ecg: Plot('ecg'),
ibp: Plot('ibpWave'),
pleth: Plot('pleth'),
resp: Plot('resp')
};


let state = { t:0, rhythm:'sinus', hr:70, spo2:98, art_sys:120, art_dia:70, bis:45, tof_count:4, tof_ratio:100, nibp:{sys:120,dia:70,due:false} };


function updateNumerics(){
const hrEl = document.getElementById('hr');
const spo2El = document.getElementById('spo2');
const ibpEl = document.getElementById('ibp');
const nibpEl = document.getElementById('nibp');
const bisEl = document.getElementById('bis');
const tofEl = document.getElementById('tof');
const phaseLabel = document.getElementById('phaseLabel');


function classFor(val, good){ return val? 'ok':'bad'; }


hrEl.textContent = state.hr || 0; hrEl.className = state.hr>40? 'ok':'bad';
spo2El.textContent = state.spo2; spo2El.className = state.spo2>=92? 'ok' : state.spo2>=85? 'warn':'bad';
ibpEl.textContent = `${state.art_sys}/${state.art_dia}`; ibpEl.className = state.art_sys>80? 'ok':'bad';
bisEl.textContent = state.bis; bisEl.className = (state.bis>=40 && state.bis<=60)? 'ok' : 'warn';
tofEl.textContent = `${state.tof_count} (${state.tof_ratio}%)`; tofEl.className = state.tof_ratio>=90? 'ok':'warn';


if (state.nibp.due){
nibpEl.textContent = `${state.nibp.sys}/${state.nibp.dia}`; nibpEl.className = 'warn';
} else {
nibpEl.textContent = '—'; nibpEl.className = 'warn';
}
phaseLabel.textContent = `Scenario: ${state.scenario} · Phase ${state.phase+1} · t=${state.t_in_phase}s`;
}


// Poll backend 2 Hz for parameters
async function poll(){
try {
const r = await fetch('/monitor/api/state/');
const js = await r.json();
state = js;
updateNumerics();
} catch(e){ console.error(e); }
}
setInterval(poll, 500);


// Render waveforms at ~50 fps
let t0 = performance.now();
function draw(){
const t = (performance.now()-t0)/1000.0;
const N = 600; // samples per strip
const xsECG = new Array(N).fill(0).map((_,i)=> ecgSample(t + i*0.004, state.hr, state.rhythm));
const xsIBP = new Array(N).fill(0).map((_,i)=> ibpSample(t + i*0.004, state.art_sys, state.art_dia, state.hr, state.rhythm));
const xsPle = new Array(N).fill(0).map((_,i)=> plethSample(t + i*0.004, state.spo2, state.hr, state.rhythm));
const xsResp = new Array(N).fill(0).map((_,i)=> respSample(t + i*0.02));


plots.ecg.clear(); plots.ibp.clear(); plots.pleth.clear(); plots.resp.clear();
plots.ecg.line(xsECG, '#00ff88');
plots.ibp.line(xsIBP, '#ffff00');
plots.pleth.line(xsPle, '#00ccff');
plots.resp.line(xsResp, '#ff66ff');


requestAnimationFrame(draw);
}
requestAnimationFrame(draw);