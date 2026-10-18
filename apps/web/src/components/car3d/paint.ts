/** Колір кузова з оголошення («Колір: Білий») → колір фарби 3D-моделі. */
const PAINTS: [RegExp, string][] = [
  [/біл|white|перламутр/i, '#e9edf0'],
  [/чорн|black/i, '#16191c'],
  [/срібл|silver/i, '#b9c1c7'],
  [/сір|grey|gray|графіт/i, '#6b747b'],
  [/син|blue/i, '#1f3f73'],
  [/блакит|голуб/i, '#6f9fc8'],
  [/червон|red|бордо|вишн/i, '#8d1a1f'],
  [/зелен|green/i, '#2d4f3a'],
  [/корич|brown|шоколад/i, '#4a3426'],
  [/беж|beige|золот|gold/i, '#b8a582'],
  [/жовт|yellow/i, '#d9b52c'],
  [/помаран|orange/i, '#cf6a24'],
];

/** Сріблястий металік за замовчуванням — як у шоурумі. */
export const DEFAULT_PAINT = '#c3cad0';

export function paintFromColorName(name: string | undefined | null): string {
  if (!name) return DEFAULT_PAINT;
  return PAINTS.find(([pattern]) => pattern.test(name))?.[1] ?? DEFAULT_PAINT;
}
