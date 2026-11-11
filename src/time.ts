import { Temporal } from "@js-temporal/polyfill";

export function canonicalZone(zone: string): string {
  return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions()
    .timeZone;
}

export function timeZoneLabel(zone: string, instant: Date) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "long",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")!.value;
  const commonNames: Record<string, string> = {
    "Japan Standard Time": "JST",
    "India Standard Time": "IST",
    "China Standard Time": "CST",
    "Korean Standard Time": "KST",
    "Singapore Standard Time": "SGT",
    "Gulf Standard Time": "GST",
    "Nepal Time": "NPT",
  };
  const shortNames = ["en-US", "en-GB", "en-AU"].map(
    (locale) =>
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" })
        .formatToParts(instant)
        .find((part) => part.type === "timeZoneName")!.value,
  );
  const offset = utcLabel(zone, instant);
  const abbreviation =
    commonNames[name] ??
    shortNames.find((short) => !/^(GMT|UTC)[+-]/.test(short)) ??
    offset;
  return { abbreviation, offset, name };
}

export function calendarDayDifference(
  zone: string,
  home: string,
  instant: Date,
): number {
  const homeDate = Temporal.PlainDate.from(
    localInput(instant, home).slice(0, 10),
  );
  const destinationDate = Temporal.PlainDate.from(
    localInput(instant, zone).slice(0, 10),
  );
  return homeDate.until(destinationDate).days;
}

export function offsetMinutes(zone: string, instant: Date): number {
  return (
    Temporal.Instant.fromEpochMilliseconds(
      instant.getTime(),
    ).toZonedDateTimeISO(zone).offsetNanoseconds / 60_000_000_000
  );
}

export function utcLabel(zone: string, instant: Date): string {
  const minutes = offsetMinutes(zone, instant);
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  return `UTC${sign}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, "0")}` : ""}`;
}

export function differenceLabel(
  zone: string,
  home: string,
  instant: Date,
): string {
  const minutes = offsetMinutes(zone, instant) - offsetMinutes(home, instant);
  if (!minutes) return "Same time as you";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const remainder = Math.abs(minutes) % 60;
  const duration =
    `${hours ? `${hours}h` : ""}${remainder ? ` ${remainder}m` : ""}`.trim();
  return `${duration} ${minutes > 0 ? "ahead of" : "behind"} you`;
}

export function localInput(instant: Date, zone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

export function parseLocalInput(value: string, zone: string): Date {
  const plain = Temporal.PlainDateTime.from(value);
  const zoned = plain.toZonedDateTime(zone, { disambiguation: "reject" });
  return new Date(zoned.epochMilliseconds);
}

export function clock(instant: Date, zone: string, seconds = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
  }).format(instant);
}

export function dateLabel(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
}

export function cityName(zone: string): string {
  if (zone === "Etc/UTC" || zone === "UTC") return "Coordinated Universal Time";
  if (zone.startsWith("Etc/GMT")) return "Open ocean";
  return zone.split("/").at(-1)!.replaceAll("_", " ");
}

export function solarPosition(instant: Date): {
  latitude: number;
  longitude: number;
} {
  const julianDays = instant.getTime() / 86_400_000 + 2440587.5 - 2451545;
  const radians = Math.PI / 180;
  const meanLongitude = (280.46 + 0.9856474 * julianDays) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * julianDays) % 360) * radians;
  const ecliptic =
    (meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly)) *
    radians;
  const obliquity = (23.439 - 0.0000004 * julianDays) * radians;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(ecliptic));
  const rightAscension =
    Math.atan2(Math.cos(obliquity) * Math.sin(ecliptic), Math.cos(ecliptic)) /
    radians;
  const sidereal = 280.46061837 + 360.98564736629 * julianDays;
  const longitude = ((((rightAscension - sidereal) % 360) + 540) % 360) - 180;
  return { latitude: declination / radians, longitude };
}

export function isDaytime(instant: Date, zone: string): boolean {
  const hour = Number(clock(instant, zone).slice(0, 2));
  return hour >= 7 && hour < 19;
}

export function isWorkingTime(instant: Date, zone: string): boolean {
  const hour = Number(clock(instant, zone).slice(0, 2));
  return hour >= 9 && hour < 17;
}

export const places = [
  {
    zone: "America/Los_Angeles",
    lat: 34.05,
    lon: -118.24,
    country: "United States",
  },
  {
    zone: "America/New_York",
    lat: 40.71,
    lon: -74.01,
    country: "United States",
  },
  { zone: "Europe/London", lat: 51.51, lon: -0.13, country: "United Kingdom" },
  { zone: "Europe/Rome", lat: 41.9, lon: 12.5, country: "Italy" },
  {
    zone: "Asia/Dubai",
    lat: 25.2,
    lon: 55.27,
    country: "United Arab Emirates",
  },
  { zone: "Asia/Kolkata", lat: 22.57, lon: 88.36, country: "India" },
  { zone: "Asia/Kathmandu", lat: 27.72, lon: 85.32, country: "Nepal" },
  { zone: "Asia/Singapore", lat: 1.35, lon: 103.82, country: "Singapore" },
  { zone: "Asia/Tokyo", lat: 35.68, lon: 139.69, country: "Japan" },
  { zone: "Australia/Sydney", lat: -33.87, lon: 151.21, country: "Australia" },
];
