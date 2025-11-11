from dataclasses import dataclass
from typing import Optional
from .models import Scenario

@dataclass
class State:
    rhythm: str
    hr: int
    spo2: int
    bis: int
    tof_count: int
    tof_ratio: int
    art_sys: int
    art_dia: int
    nibp_sys: int
    nibp_dia: int
    nibp_due: bool
    phase_index: int
    t_in_phase: int


def state_for_time(scenario: Scenario, t_sec: int) -> Optional[State]:
    if t_sec < 0:
        t_sec = 0
    # Loop scenario if t exceeds total
    total = scenario.total_duration_sec
    if total <= 0:
        total = sum(p.duration_sec for p in scenario.phases.all()) or 1
    t_mod = t_sec % total

    elapsed = 0
    phases = list(scenario.phases.all())
    for idx, p in enumerate(phases):
        if t_mod < elapsed + p.duration_sec:
            t_in_phase = t_mod - elapsed
            # NIBP measurement: show every nibp_interval, for 10s window
            nibp_due = p.nibp_interval_sec and (t_in_phase % p.nibp_interval_sec) < 10
            return State(
                rhythm=p.rhythm,
                hr=p.heart_rate,
                spo2=p.spo2,
                bis=p.bis,
                tof_count=p.tof_count,
                tof_ratio=p.tof_ratio,
                art_sys=p.art_sys,
                art_dia=p.art_dia,
                nibp_sys=p.nibp_sys,
                nibp_dia=p.nibp_dia,
                nibp_due=nibp_due,
                phase_index=idx,
                t_in_phase=int(t_in_phase),
            )
        elapsed += p.duration_sec
    return None