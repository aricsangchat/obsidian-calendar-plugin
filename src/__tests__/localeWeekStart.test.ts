import { getLocaleWeekStart } from "../localeWeekStart";

describe("getLocaleWeekStart", () => {
  const originalMoment = window.moment;

  afterEach(() => {
    window.moment = originalMoment;
    delete (window as unknown as Record<string, unknown>)
      ._bundledLocaleWeekSpec;
  });

  function stubMoment(firstDayOfWeek?: () => number) {
    window.moment = (() => ({
      localeData: () => (firstDayOfWeek ? { firstDayOfWeek } : {}),
    })) as unknown as typeof window.moment;
  }

  it("uses the bundled locale week spec when it is populated", () => {
    window._bundledLocaleWeekSpec = { dow: 0, doy: 6 };
    stubMoment(() => 3);

    expect(getLocaleWeekStart()).toBe(0);
  });

  it("honours dow: 0 rather than treating it as absent", () => {
    // Sunday is 0, which is falsy. A `||` fallback silently rewrites every
    // Sunday-start locale (en-US among them) to Monday.
    window._bundledLocaleWeekSpec = { dow: 0, doy: 6 };

    expect(getLocaleWeekStart()).toBe(0);
  });

  it("falls back to moment when the bundled spec is undefined (#417)", () => {
    // The cold-start, non-English-locale case: overrideGlobalMomentWeekStart()
    // assigned `moment.localeData()._week` before the locale bundle had
    // loaded, so the global was silently left undefined.
    stubMoment(() => 1);

    expect(getLocaleWeekStart()).toBe(1);
  });

  it("does not throw when the bundled spec is undefined", () => {
    stubMoment(() => 1);

    expect(() => getLocaleWeekStart()).not.toThrow();
  });

  it("falls back to Monday when moment cannot answer either", () => {
    stubMoment(undefined);

    expect(getLocaleWeekStart()).toBe(1);
  });

  it("ignores a malformed bundled spec instead of returning NaN", () => {
    (window as unknown as Record<string, unknown>)._bundledLocaleWeekSpec = {
      dow: "monday",
    };
    stubMoment(() => 6);

    expect(getLocaleWeekStart()).toBe(6);
  });
});
