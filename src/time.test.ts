import { describe, expect, it } from "vitest";
import {
  canonicalZone,
  calendarDayDifference,
  differenceLabel,
  localInput,
  offsetMinutes,
  parseLocalInput,
  solarPosition,
  utcLabel,
  clock,
  timeZoneLabel,
  isWorkingTime,
} from "./time";

describe("time conversion", () => {
  it("labels standard and daylight time for the requested date, not today's season", () => {
    const winter = new Date("2026-01-15T12:00Z");
    const summer = new Date("2026-07-15T12:00Z");
    expect(timeZoneLabel("America/New_York", winter)).toMatchObject({
      abbreviation: "EST",
      offset: "UTC−5",
    });
    expect(timeZoneLabel("America/New_York", summer)).toMatchObject({
      abbreviation: "EDT",
      offset: "UTC−4",
    });
    expect(timeZoneLabel("Europe/Rome", winter)).toMatchObject({
      abbreviation: "CET",
      offset: "UTC+1",
    });
    expect(timeZoneLabel("Europe/Rome", summer)).toMatchObject({
      abbreviation: "CEST",
      offset: "UTC+2",
    });
    expect(timeZoneLabel("UTC", winter).abbreviation).toBe("UTC");
    expect(timeZoneLabel("Asia/Tokyo", winter).abbreviation).toBe("JST");
  });
  it("disambiguates repeated abbreviations with an explicit UTC offset", () => {
    const winter = new Date("2026-01-15T12:00Z");
    expect(timeZoneLabel("Asia/Shanghai", winter)).toMatchObject({
      abbreviation: "CST",
      offset: "UTC+8",
    });
    expect(timeZoneLabel("America/Chicago", winter)).toMatchObject({
      abbreviation: "CST",
      offset: "UTC−6",
    });
  });
  it("counts calendar date rollovers across month and year boundaries", () => {
    const instant = new Date("2026-12-31T12:30Z");
    expect(
      calendarDayDifference("Pacific/Kiritimati", "Pacific/Pago_Pago", instant),
    ).toBe(1);
    expect(
      calendarDayDifference("Pacific/Pago_Pago", "Pacific/Kiritimati", instant),
    ).toBe(-1);
    expect(calendarDayDifference("Europe/Paris", "Europe/Rome", instant)).toBe(
      0,
    );
    expect(
      calendarDayDifference(
        "Pacific/Kiritimati",
        "Etc/GMT+12",
        new Date("2026-12-31T11:30Z"),
      ),
    ).toBe(2);
  });
  it("matches historical aliases to current geographic zone names", () => {
    expect(canonicalZone("Asia/Kathmandu")).toBe(
      canonicalZone("Asia/Katmandu"),
    );
    expect(canonicalZone("Asia/Kolkata")).toBe(canonicalZone("Asia/Calcutta"));
  });
  it("uses the chosen date's daylight-saving offset, not today's", () => {
    expect(
      offsetMinutes("America/New_York", new Date("2026-01-15T12:00Z")),
    ).toBe(-300);
    expect(
      offsetMinutes("America/New_York", new Date("2026-07-15T12:00Z")),
    ).toBe(-240);
  });
  it("handles fractional offsets and differences", () => {
    const instant = new Date("2026-01-15T12:00Z");
    expect(utcLabel("Asia/Kathmandu", instant)).toBe("UTC+5:45");
    expect(differenceLabel("Asia/Kathmandu", "Asia/Kolkata", instant)).toBe(
      "15m ahead of you",
    );
    expect(differenceLabel("America/New_York", "Europe/Rome", instant)).toBe(
      "6h behind you",
    );
    expect(differenceLabel("Europe/Rome", "Europe/Paris", instant)).toBe(
      "Same time as you",
    );
  });
  it("converts local time across the international date line", () => {
    const instant = parseLocalInput("2026-01-15T23:30", "America/Los_Angeles");
    expect(localInput(instant, "Asia/Tokyo")).toBe("2026-01-16T16:30");
    expect(clock(instant, "Asia/Tokyo")).toBe("16:30");
  });
  it("explicitly rejects skipped and repeated local times during DST changes", () => {
    expect(() =>
      parseLocalInput("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
    expect(() =>
      parseLocalInput("2026-11-01T01:30", "America/New_York"),
    ).toThrow();
    expect(() => parseLocalInput("", "Europe/Rome")).toThrow();
  });
});

describe("working hours", () => {
  it.each([
    ["2026-01-15T07:59:59Z", false],
    ["2026-01-15T08:00:00Z", true],
    ["2026-01-15T15:59:59Z", true],
    ["2026-01-15T16:00:00Z", false],
  ])(
    "checks 09:00 inclusive and 17:00 exclusive in the local zone: %s",
    (value, expected) => {
      expect(isWorkingTime(new Date(value), "Europe/Rome")).toBe(expected);
    },
  );
  it("uses the chosen date's DST rules and fractional offsets", () => {
    expect(
      isWorkingTime(new Date("2026-01-15T13:00Z"), "America/New_York"),
    ).toBe(false);
    expect(
      isWorkingTime(new Date("2026-07-15T13:00Z"), "America/New_York"),
    ).toBe(true);
    expect(isWorkingTime(new Date("2026-01-15T03:14Z"), "Asia/Kathmandu")).toBe(
      false,
    );
    expect(isWorkingTime(new Date("2026-01-15T03:15Z"), "Asia/Kathmandu")).toBe(
      true,
    );
  });
  it("applies the daily 9–5 rule on weekends and across date lines", () => {
    expect(isWorkingTime(new Date("2026-01-18T10:00Z"), "Europe/Rome")).toBe(
      true,
    );
    expect(
      isWorkingTime(new Date("2026-01-15T19:00Z"), "Pacific/Kiritimati"),
    ).toBe(true);
    expect(
      isWorkingTime(new Date("2026-01-15T19:00Z"), "Pacific/Pago_Pago"),
    ).toBe(false);
  });
});

describe("solar illumination", () => {
  it("puts the June solstice sun over the northern tropic", () => {
    const sun = solarPosition(new Date("2026-06-21T12:00:00Z"));
    expect(sun.latitude).toBeCloseTo(23.44, 0);
    expect(Math.abs(sun.longitude)).toBeLessThan(2);
  });
  it("moves the subsolar point 180 degrees in half a day", () => {
    const noon = solarPosition(new Date("2026-03-20T12:00:00Z"));
    const midnight = solarPosition(new Date("2026-03-21T00:00:00Z"));
    expect(Math.abs(noon.latitude)).toBeLessThan(1);
    expect(Math.abs(midnight.longitude)).toBeGreaterThan(175);
  });
});
