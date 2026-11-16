import { routes } from "../../../shared/catalog";
import { artworks } from "../../../shared/catalog";
export type JourneyPreset = {
  id: string;
  name: string;
  subtitle: string;
  stops: string[];
  minViewSeconds: number;
  narrationSeconds: number;
  budgetSeconds: number;
};
export function journeyPresets(): JourneyPreset[] {
  return routes.map((r) => {
    const works = r.stops
      .map((id) => artworks.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a);
    const minViewSeconds = works.reduce((n, a) => n + a.minView, 0);
    const narrationSeconds = works.reduce((n, a) => n + a.duration, 0);
    return {
      id: r.id,
      name: r.name,
      subtitle: r.subtitle,
      stops: r.stops,
      minViewSeconds,
      narrationSeconds,
      budgetSeconds: 8 * 60,
    };
  });
}
