import yaml
from .models import Scenario, Phase

# Example DSL structure:
# scenario:
#   name: VF Arrest Demo
#   total_duration_sec: 240
# phases:
#   - duration: 60
#     state: {rhythm: tachy, hr: 150, spo2: 96, bis: 45, tof_count: 4, tof_ratio: 100, art: [140, 80], nibp: [140, 80], nibp_interval: 120}
#   - duration: 60
#     state: {rhythm: vf, hr: 0, spo2: 85, bis: 30, tof_count: 0, tof_ratio: 0, art: [0, 0], nibp: [0, 0], nibp_interval: 9999}
#   - duration: 120
#     state: {rhythm: asystole, hr: 0, spo2: 70, bis: 0, tof_count: 0, tof_ratio: 0, art: [0, 0], nibp: [0, 0], nibp_interval: 9999}


def load_yaml(path: str, activate: bool = True) -> Scenario:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    scen_data = data.get("scenario", {})
    phases = data.get("phases", [])

    scen, _ = Scenario.objects.get_or_create(
        name=scen_data.get("name", "Untitled Scenario"),
        defaults={
            "description": scen_data.get("description", ""),
            "total_duration_sec": scen_data.get("total_duration_sec", sum(p.get("duration", 60) for p in phases)),
        },
    )
    scen.description = scen_data.get("description", scen.description)
    scen.total_duration_sec = scen_data.get("total_duration_sec", scen.total_duration_sec)
    scen.save()

    scen.phases.all().delete()

    for i, p in enumerate(phases):
        s = p.get("state", {})
        art = s.get("art", [120, 70])
        nibp = s.get("nibp", art)
        Phase.objects.create(
            scenario=scen,
            order=i,
            duration_sec=p.get("duration", 60),
            rhythm=s.get("rhythm", "sinus"),
            heart_rate=s.get("hr", 70),
            spo2=s.get("spo2", 98),
            bis=s.get("bis", 45),
            tof_count=s.get("tof_count", 4),
            tof_ratio=s.get("tof_ratio", 100),
            art_sys=art[0], art_dia=art[1],
            nibp_sys=nibp[0], nibp_dia=nibp[1],
            nibp_interval_sec=s.get("nibp_interval", 180),
            notes=p.get("notes", ""),
        )

    if activate:
        Scenario.objects.all().update(is_active=False)
        scen.is_active = True
        scen.save()

    return scen