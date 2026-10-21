import { CAR_ZONE_LABELS, type CarZone, type ReportFinding } from '@carintel/shared';
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { SEVERITY_COLOR, worstSeverity } from '../car/zones';
import { ErrorBoundary } from '../ErrorBoundary';
import type { SceneCommands } from './CarScene';
import { DEFAULT_PAINT } from './paint';

// Three.js важкий — вантажимо його лише на сторінках зі сценою.
const CarScene = lazy(() => import('./CarScene'));

interface ShowroomProps {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  /** 3D-модель саме цього авто, згенерована з фото оголошення. */
  modelUrl?: string;
  /** Фото авто з оголошення — показуємо, поки 3D немає, замість чужої стандартної моделі. */
  photo?: string;
  /** Повідомлення під авто (напр. чому 3D не згенерувалось і кнопка «ще раз»). */
  notice?: ReactNode;
  paint?: string;
  findings?: ReportFinding[];
  selectedZone?: CarZone | null;
  onSelectZone?: (zone: CarZone | null) => void;
  scanning?: boolean;
}

/** 3D-шоурум у стилі CarWhisperer: авто на поворотному столі, яке можна крутити на 360°. */
export function Showroom({
  eyebrow,
  title,
  subtitle,
  modelUrl,
  photo,
  notice,
  paint = DEFAULT_PAINT,
  findings = [],
  selectedZone = null,
  onSelectZone = () => {},
  scanning = false,
}: ShowroomProps) {
  const commands = useRef<SceneCommands | null>(null);
  const zones = groupByZone(findings);
  // 3D цього авто не завантажилась (напр. сховище недоступне) — показуємо фото, а не «браузер не підтримує».
  const [failedModelUrl, setFailedModelUrl] = useState<string>();
  const modelFailed = Boolean(modelUrl) && failedModelUrl === modelUrl;
  const showPhoto = (!modelUrl || modelFailed) && Boolean(photo);

  return (
    <section className="showroom relative h-[78vh] min-h-[560px] overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]">
      <div className="showroom-ray left-[18%]" />
      <div className="showroom-ray left-[46%]" style={{ animationDelay: '-2.5s', width: '10%' }} />
      <div className="showroom-ray left-[70%]" style={{ animationDelay: '-5s' }} />

      {showPhoto ? (
        <PhotoStage photo={photo!} scanning={scanning} />
      ) : (
        // Без WebGL (вимкнене апаратне прискорення, збій драйвера) сцена падає — решта сторінки має жити.
        // key: нова модель (перегенерація) — нова сцена з заїздом авто.
        <ErrorBoundary
          key={modelUrl}
          fallback={() => <SceneUnavailable />}
          onError={() => {
            if (modelUrl) setFailedModelUrl(modelUrl);
          }}
        >
          <Suspense fallback={<SceneLoader />}>
            <CarScene
              modelUrl={modelUrl}
              paint={paint}
              findings={findings}
              selectedZone={selectedZone}
              onSelectZone={onSelectZone}
              scanning={scanning}
              commands={commands}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-8 z-10 px-6 text-center">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight drop-shadow md:text-5xl">{title}</h1>
        {subtitle && <div className="mt-2 text-mist">{subtitle}</div>}
      </header>

      {zones.size > 0 && (
        <nav className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-1.5 md:flex">
          {[...zones.entries()].map(([zone, items], index) => {
            const active = selectedZone === zone;
            const color = SEVERITY_COLOR[worstSeverity(items.map((f) => f.severity))];
            return (
              <button
                key={zone}
                onClick={() => onSelectZone(active ? null : zone)}
                className={`animate-fade-up flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm backdrop-blur-md transition-all ${
                  active
                    ? 'border-white/30 bg-night/70 text-ice'
                    : 'border-white/10 bg-night/40 text-ice/80 hover:bg-night/60 hover:text-ice'
                }`}
                style={{ animationDelay: `${2400 + index * 80}ms` }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-night"
                  style={{ background: color }}
                >
                  {items.length}
                </span>
                <span className={active ? 'text-base font-semibold' : ''}>{CAR_ZONE_LABELS[zone]}</span>
              </button>
            );
          })}
        </nav>
      )}

      {!showPhoto && (
        <>
          <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
            <RoundButton label="Наблизити" onClick={() => commands.current?.zoom(1.2)}>+</RoundButton>
            <RoundButton label="Віддалити" onClick={() => commands.current?.zoom(-1.2)}>−</RoundButton>
            <RoundButton
              label="Початковий вигляд"
              onClick={() => {
                onSelectZone(null);
                commands.current?.reset();
              }}
            >
              ⟲
            </RoundButton>
          </div>

          <div className="absolute inset-x-0 bottom-[7%] z-10 flex items-center justify-center gap-4">
            <RoundButton label="Повернути вліво" onClick={() => commands.current?.rotateBy(-45)}>‹</RoundButton>
            <span className="select-none text-sm font-semibold tracking-[0.2em] text-ice/80">360°</span>
            <RoundButton label="Повернути вправо" onClick={() => commands.current?.rotateBy(45)}>›</RoundButton>
          </div>
        </>
      )}

      {notice && (
        // Над картками звіту, які наїжджають на низ шоуруму.
        <div className="absolute inset-x-0 bottom-36 z-10 flex justify-center px-6">{notice}</div>
      )}

      <p className="pointer-events-none absolute bottom-3 right-5 z-10 text-[10px] text-ice/35">
        {showPhoto
          ? modelFailed
            ? 'Фото з оголошення · 3D-модель не вдалося завантажити, спробуй оновити сторінку пізніше'
            : 'Фото з оголошення'
          : modelUrl
            ? 'Перетягни, щоб покрутити · 3D згенеровано з фото оголошення (TRELLIS)'
            : 'Перетягни, щоб покрутити · 3D: «Car Concept» © Khronos Group, CC BY 4.0'}
      </p>
    </section>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 text-lg text-ice backdrop-blur transition-all hover:bg-white/15 active:scale-95"
    >
      {children}
    </button>
  );
}

/** Реальне фото авто на «сцені» — поки 3D саме цього авто немає. */
function PhotoStage({ photo, scanning }: { photo: string; scanning: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-56 top-[24%] flex items-center justify-center px-6 md:px-[22%]">
      <div className="car-drive-in relative h-full overflow-hidden rounded-2xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]">
        <img src={photo} alt="Авто з оголошення" className="block h-full w-auto max-w-full object-contain" />
        {scanning && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="scan-beam h-full w-1/5 bg-gradient-to-r from-transparent via-sky-200/40 to-transparent mix-blend-screen" />
          </div>
        )}
      </div>
    </div>
  );
}

function SceneLoader() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/15 border-t-ice" />
      <span className="text-shimmer text-sm font-medium">Готуємо шоурум…</span>
    </div>
  );
}

function SceneUnavailable() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="text-sm font-medium text-ice/80">3D-перегляд недоступний у цьому браузері</span>
      <span className="max-w-sm text-xs text-mist">
        Увімкни апаратне прискорення в налаштуваннях браузера й перезавантаж сторінку. Звіт нижче працює й без 3D.
      </span>
    </div>
  );
}

function groupByZone(findings: ReportFinding[]) {
  const map = new Map<CarZone, ReportFinding[]>();
  for (const finding of findings) map.set(finding.zone, [...(map.get(finding.zone) ?? []), finding]);
  return map;
}
