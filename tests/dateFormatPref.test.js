import { describe, test, expect, beforeEach } from "bun:test";
import { loadUnits, setUnits, resetUnitsCache, currentDateFormat, DATE_FORMATS } from "../js/ui/units.js";
import { date } from "../js/ui/format.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => { store.clear(); resetUnitsCache(); });

describe("dateFormat preference", () => {
  test("defaults to dmy and DATE_FORMATS has 3 entries", () => {
    expect(loadUnits().dateFormat).toBe("dmy");
    expect(Object.keys(DATE_FORMATS).sort()).toEqual(["dmy", "mdy", "ymd"]);
    expect(currentDateFormat()).toBe("dmy");
  });
  for (const fmt of ["dmy", "mdy", "ymd"]) {
    test(`round-trip ${fmt}`, () => {
      setUnits({ dateFormat: fmt });
      expect(loadUnits().dateFormat).toBe(fmt);
      resetUnitsCache();
      expect(loadUnits().dateFormat).toBe(fmt);
    });
  }
  test("fallback on unknown", () => {
    setUnits({ dateFormat: "bogus" });
    expect(loadUnits().dateFormat).toBe("dmy");
    store.set("tt.units", JSON.stringify({ dateFormat: "nope", currency: "DEFAULT", speed: "kmh" }));
    resetUnitsCache();
    expect(loadUnits().dateFormat).toBe("dmy");
  });
  test("resetUnitsCache resets to localStorage value", () => {
    setUnits({ dateFormat: "mdy" });
    store.set("tt.units", JSON.stringify({ dateFormat: "ymd" }));
    resetUnitsCache();
    expect(loadUnits().dateFormat).toBe("ymd");
  });
  test("date formatting per format", () => {
    const d = { year: 1950, month: 2, day: 12 };
    setUnits({ dateFormat: "dmy" }); expect(date(d)).toBe("12 Mar 1950");
    setUnits({ dateFormat: "mdy" }); expect(date(d)).toBe("Mar 12 1950");
    setUnits({ dateFormat: "ymd" }); expect(date(d)).toBe("1950-03-12");
    setUnits({ dateFormat: "dmy" }); expect(date(null)).toBe("");
    expect(date({ year: 2000, month: 0, day: 5 })).toBe("5 Jan 2000");
  });
});
