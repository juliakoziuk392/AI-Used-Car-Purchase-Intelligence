import { CAR_ZONE_LABELS, type CarZone, type ReportFinding } from '@carintel/shared';
import { CarSilhouette } from './CarSilhouette';
import { SEVERITY_COLOR, worstSeverity, zonePosition } from './zones';

interface CarStageProps {
  findings?: ReportFinding[];
  selectedZone?: CarZone | null;
  onSelectZone?: (zone: CarZone | null) => void;
  /** Режим аналізу: по авто бігає промінь сканера, точок ще немає. */
  scanning?: boolean;
  /** Затримка перед появою першої точки — щоб авто встигло заїхати. */
  hotspotDelayMs?: number;
}

export function CarStage({
  findings = [],
  selectedZone = null,
  onSelectZone,
  scanning = false,
  hotspotDelayMs = 1300,
}: CarStageProps) {
  const zones = groupByZone(findings);

  return (
    <div className="relative mx-auto w-full max-w-4xl select-none">
      {/* «Поворотний стіл» під авто */}
      <svg viewBox="0 0 800 120" className="absolute inset-x-0 bottom-[-6%] w-full" aria-hidden>
        <g className="turntable">
          <ellipse cx="400" cy="60" rx="380" ry="46" fill="none" stroke="white" strokeOpacity="0.14" strokeDasharray="2 10" strokeWidth="2" />
        </g>
        <ellipse cx="400" cy="60" rx="300" ry="34" fill="none" stroke="white" strokeOpacity="0.07" />
      </svg>

      <div className="relative car-drive-in">
        <CarSilhouette className="w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.45)]" />

        {scanning && (
          <div className="pointer-events-none absolute inset-y-[18%] left-[10%] right-[8%] overflow-hidden" aria-hidden>
            <div className="scan-beam h-full w-1/5 bg-gradient-to-r from-transparent via-sky-200/40 to-transparent mix-blend-screen" />
          </div>
        )}

        {[...zones.entries()].map(([zone, items], index) => {
          const color = SEVERITY_COLOR[worstSeverity(items.map((f) => f.severity))];
          const isSelected = selectedZone === zone;
          const isDimmed = selectedZone !== null && !isSelected;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => onSelectZone?.(isSelected ? null : zone)}
              className="hotspot group absolute z-10 h-7 w-7"
              style={{ ...zonePosition(zone), animationDelay: `${hotspotDelayMs + index * 180}ms` }}
              aria-label={`${CAR_ZONE_LABELS[zone]}: ${items.length} знахідок`}
            >
              <span
                className="hotspot-ring absolute inset-0 rounded-full"
                style={{ background: color, animationDelay: `${index * 250}ms` }}
              />
              <span
                className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/90 text-xs font-bold text-night shadow-lg transition-all duration-300 ${
                  isSelected ? 'scale-125' : 'group-hover:scale-110'
                } ${isDimmed ? 'opacity-40' : ''}`}
                style={{ background: color }}
              >
                {items.length}
              </span>
              <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-night/85 px-3 py-1 text-xs font-medium text-ice opacity-0 transition-opacity group-hover:opacity-100">
                {CAR_ZONE_LABELS[zone]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function groupByZone(findings: ReportFinding[]) {
  const map = new Map<CarZone, ReportFinding[]>();
  for (const finding of findings) map.set(finding.zone, [...(map.get(finding.zone) ?? []), finding]);
  return map;
}
