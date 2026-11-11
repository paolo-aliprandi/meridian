export type ScreenPoint = { x: number; y: number };

export function zonesBetween(
  start: ScreenPoint,
  end: ScreenPoint,
  zoneAt: (point: ScreenPoint) => string | null,
): string[] {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 2),
  );
  const zones = new Set<string>();
  for (let i = 0; i < steps; i++) {
    const fraction = (i + 0.5) / steps;
    const zone = zoneAt({
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
    });
    if (zone) zones.add(zone);
  }
  return [...zones];
}
