import { describe, expect, it } from "vitest";
import { zonesBetween } from "./selection";

describe("border interval selection", () => {
  const zoneAt = ({ x }: { x: number }) =>
    x < 0 || x >= 60 ? null : x < 20 ? "west" : x < 24 ? "narrow" : "east";
  it("finds intermediate zones even when the pointer jumps across a narrow zone", () => {
    expect(zonesBetween({ x: 0, y: 0 }, { x: 60, y: 0 }, zoneAt)).toEqual([
      "west",
      "narrow",
      "east",
    ]);
  });
  it("supports reverse intervals and excludes zones beyond both boundaries", () => {
    expect(zonesBetween({ x: 60, y: 0 }, { x: 20, y: 0 }, zoneAt)).toEqual([
      "east",
      "narrow",
    ]);
  });
  it("shrinks the selection instead of retaining previously crossed zones", () => {
    expect(zonesBetween({ x: 0, y: 0 }, { x: 20, y: 0 }, zoneAt)).toEqual([
      "west",
    ]);
  });
  it("ignores off-globe samples and deduplicates zones", () => {
    expect(zonesBetween({ x: -20, y: 0 }, { x: 80, y: 0 }, zoneAt)).toEqual([
      "west",
      "narrow",
      "east",
    ]);
    expect(zonesBetween({ x: -20, y: 0 }, { x: -10, y: 0 }, zoneAt)).toEqual(
      [],
    );
  });
});
