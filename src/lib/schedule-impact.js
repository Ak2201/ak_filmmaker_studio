/* ============================================================
   SCHEDULE IMPACT — what cutting a scene does to the money
   ------------------------------------------------------------
   PURE and DERIVE-ONLY, like readiness.js: it imports nothing,
   touches no storage and no clock, and mutates nothing it is
   given. Every answer is computed from the scenes and estimator
   lines passed in.

   The honest rule: cutting a scene only SAVES the per-day
   running cost when it empties a shoot day (it was the only
   scheduled scene on it). `apportioned` is an informational
   share by eighths, and is NOT a saving.
   ============================================================ */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function dayOf(scene) {
  const n = parseInt(scene && scene.shootDay, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function scheduleDays(scenes) {
  const by = new Map();
  for (const s of scenes || []) {
    const d = dayOf(s);
    if (!d) continue;
    if (!by.has(d)) by.set(d, { day: d, scenes: [], eighths: 0 });
    const row = by.get(d);
    row.scenes.push(s);
    row.eighths += num(s.eighths);
  }
  return [...by.values()].sort((a, b) => a.day - b.day);
}

export function isScaling(line, dayCount) {
  if (line && line.scales === true) return true;
  if (line && line.scales === false) return false;
  return dayCount > 0 && Number(line && line.days) === dayCount && Number(line && line.rate) > 0;
}

export function perDayCost(lines, dayCount) {
  const scalingIds = [];
  let perDay = 0;
  for (const l of lines || []) {
    if (!isScaling(l, dayCount)) continue;
    scalingIds.push(l.id);
    perDay += num(l.rate);
  }
  perDay = r2(perDay);
  return { perDay, scalingIds, total: r2(perDay * num(dayCount)) };
}

export function whatIfCut(scene, scenes, perDay) {
  const day = dayOf(scene);
  const sceneId = scene ? scene.id : undefined;
  if (!day) {
    return { sceneId, day: 0, freesDay: false, saves: 0, apportioned: 0, dayEighths: 0, othersOnDay: 0 };
  }
  const row = scheduleDays(scenes).find((d) => d.day === day);
  const onDay = row ? row.scenes : [];
  const others = onDay.filter((s) => s.id !== sceneId).length;
  const dayEighths = row ? row.eighths : 0;
  const freesDay = others === 0;
  return {
    sceneId, day, freesDay,
    saves: freesDay ? num(perDay) : 0,
    apportioned: dayEighths > 0 ? r2(num(perDay) * (num(scene.eighths) / dayEighths)) : 0,
    dayEighths,
    othersOnDay: others
  };
}

export function whatIfAll(scenes, perDay) {
  return (scenes || []).map((s) => whatIfCut(s, scenes, perDay));
}

export function whatIfCutMany(sceneIds, scenes, perDay) {
  const set = new Set(sceneIds || []);
  const freedDays = scheduleDays(scenes)
    .filter((d) => d.scenes.every((s) => set.has(s.id)))
    .map((d) => d.day);
  return { days: freedDays.length, saves: r2(freedDays.length * num(perDay)), freedDays };
}

export function projectedEstimate({ estimate, perDay, fromDays, toDays } = {}) {
  const v = num(estimate) + (num(toDays) - num(fromDays)) * num(perDay);
  return r2(Math.max(0, v));
}

export default {
  dayOf, scheduleDays, isScaling, perDayCost,
  whatIfCut, whatIfAll, whatIfCutMany, projectedEstimate
};
