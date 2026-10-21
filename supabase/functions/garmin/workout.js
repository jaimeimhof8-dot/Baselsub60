// Workout-Schritte der App (src/garmin-workout.js) in das Garmin-Connect-Format (/workout-service/workout) umsetzen.
// Prüft alles streng, weil die Schritte aus dem Browser kommen. Reine Funktion, wie reduce.js ohne Netzwerk testbar.
// Hinweis: Das Zielformat folgt dem Garmin-Connect-Workout-JSON (inoffiziell). Ob Garmin es annimmt, zeigt erst der echte Versand.

const TYPE = { warmup: 1, cooldown: 2, interval: 3, recovery: 4, rest: 5 };
const SPORT = { sportTypeId: 1, sportTypeKey: "running", displayOrder: 1 };
const bad = () => Object.assign(new Error("bad_workout"), { code: "bad_workout", status: 400 });
const int = (v, lo, hi) => { if (!Number.isFinite(v) || v < lo || v > hi) throw bad(); return Math.round(v); };

/** Pace-Zielbereich ±5 s/km als Geschwindigkeit in m/s (Garmin: langsamer Wert zuerst). */
const band = (pace) => [+(1000 / (pace + 5)).toFixed(4), +(1000 / (pace - 5)).toFixed(4)];

export function buildWorkout(name, steps) {
  if (typeof name !== "string" || !name.trim() || name.length > 80) throw bad();
  if (!Array.isArray(steps) || !steps.length || steps.length > 20) throw bad();
  let order = 0, total = 0;
  const one = (s, depth) => {
    if (!s || typeof s !== "object" || ++total > 60) throw bad();
    if (s.kind === "repeat") {
      if (depth > 0 || !Array.isArray(s.steps) || !s.steps.length || s.steps.length > 6) throw bad();
      const n = int(s.n, 1, 30), o = ++order;
      const kids = s.steps.map((x) => one(x, depth + 1));
      return { type: "RepeatGroupDTO", stepId: null, stepOrder: o, stepType: { stepTypeId: 6, stepTypeKey: "repeat" }, childStepId: 1,
        numberOfIterations: n, workoutSteps: kids, endConditionValue: n, endCondition: { conditionTypeId: 7, conditionTypeKey: "iterations" },
        smartRepeat: false };
    }
    const id = TYPE[s.kind];
    if (!id) throw bad();
    const step = { type: "ExecutableStepDTO", stepId: null, stepOrder: ++order, stepType: { stepTypeId: id, stepTypeKey: s.kind } };
    if (s.lap) {
      step.endCondition = { conditionTypeId: 1, conditionTypeKey: "lap.button" };
      step.endConditionValue = null;
    } else {
      step.endCondition = { conditionTypeId: 3, conditionTypeKey: "distance" };
      step.endConditionValue = int(s.dist, 20, 60000);
    }
    if (s.pace != null) {
      const [lo, hi] = band(int(s.pace, 150, 900));
      step.targetType = { workoutTargetTypeId: 6, workoutTargetTypeKey: "pace.zone" };
      step.targetValueOne = lo;
      step.targetValueTwo = hi;
    } else step.targetType = { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" };
    return step;
  };
  return { workoutName: name.trim(), sportType: SPORT, workoutSegments: [{ segmentOrder: 1, sportType: SPORT, workoutSteps: steps.map((s) => one(s, 0)) }] };
}
