/**
 * Resolve the locale's first day of the week (0 = Sunday ... 6 = Saturday).
 *
 * `window._bundledLocaleWeekSpec` is populated by obsidian-calendar-ui's
 * `overrideGlobalMomentWeekStart()`, which assigns `moment.localeData()._week`
 * during onload. On a cold start with a non-English display language, moment's
 * locale bundle is not reliably loaded by that point, so `_week` resolves to
 * `undefined` and is assigned silently — no error is raised at the write site.
 *
 * The settings tab then read `window._bundledLocaleWeekSpec.dow`
 * unconditionally and threw, which took the whole plugin down with it. See #417.
 *
 * Falls back to asking moment directly, then to Monday — the ISO-8601 default
 * and the correct answer for most of the non-English locales this path affects.
 */
export function getLocaleWeekStart(): number {
  const bundled = window._bundledLocaleWeekSpec;
  if (bundled && typeof bundled.dow === "number") {
    return bundled.dow;
  }

  const dow = window.moment?.().localeData?.()?.firstDayOfWeek?.();
  return typeof dow === "number" ? dow : 1;
}
