import type { CarZone, RiskSeverity } from '@carintel/shared';
import { CAR_VIEWBOX } from './CarSilhouette';

/** Де на силуеті (у координатах viewBox 800×300) стоїть точка кожної зони. */
const ZONE_POINTS: Record<CarZone, [number, number]> = {
  front: [716, 200],
  engine: [632, 150],
  electrics: [522, 126],
  interior: [365, 125],
  body: [365, 188],
  rear: [100, 190],
  front_wheel: [600, 228],
  rear_wheel: [205, 228],
  transmission: [470, 240],
  underbody: [330, 244],
  documents: [760, 56],
};

export function zonePosition(zone: CarZone) {
  const [x, y] = ZONE_POINTS[zone];
  return { left: `${(x / CAR_VIEWBOX.width) * 100}%`, top: `${(y / CAR_VIEWBOX.height) * 100}%` };
}

export const SEVERITY_ORDER: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];

export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  low: 'var(--color-sev-low)',
  medium: 'var(--color-sev-medium)',
  high: 'var(--color-sev-high)',
  critical: 'var(--color-sev-critical)',
};

export const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  low: 'Незначно',
  medium: 'Увага',
  high: 'Серйозно',
  critical: 'Критично',
};

export function worstSeverity(severities: RiskSeverity[]): RiskSeverity {
  return severities.reduce<RiskSeverity>(
    (worst, s) => (SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(worst) ? s : worst),
    'low',
  );
}
