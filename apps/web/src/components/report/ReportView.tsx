import {
  CAR_ZONE_LABELS,
  type AnalysisReport,
  type CarZone,
  type ReportFinding,
  type Verdict,
} from '@carintel/shared';
import { useEffect, useState } from 'react';
import { useCountUp } from '../../lib/useCountUp';
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_ORDER } from '../car/zones';
import { PriceVerdict } from './PriceVerdict';

const VERDICT: Record<Verdict, { label: string; color: string }> = {
  buy: { label: 'Можна купувати', color: 'var(--color-sev-low)' },
  negotiate: { label: 'Торгуватися', color: 'var(--color-sev-medium)' },
  avoid: { label: 'Краще відмовитись', color: 'var(--color-sev-critical)' },
};

const usd = (value: number) => `$${value.toLocaleString('uk-UA')}`;

export function sortFindings(findings: ReportFinding[]) {
  return [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity));
}

interface ReportViewProps {
  report: AnalysisReport;
  selectedZone: CarZone | null;
  setSelectedZone: (zone: CarZone | null) => void;
  /** Усі фото оголошення — знахідки посилаються на них за номером. */
  photos: string[];
}

/** Тіло звіту під 3D-шоурумом. Сам шоурум рендерить сторінка, щоб сцена не перезавантажувалась. */
export function ReportView({ report, selectedZone, setSelectedZone, photos }: ReportViewProps) {
  const [openPhoto, setOpenPhoto] = useState<number | null>(null);
  const findings = sortFindings(report.findings);
  const visible = selectedZone ? findings.filter((f) => f.zone === selectedZone) : findings;

  return (
    <div className="flex flex-col gap-8">
      {/* Картки «наїжджають» на низ сцени, як панелі в шоурумі. */}
      <section className="relative z-10 -mt-24 grid gap-4 px-4 md:grid-cols-3 md:px-8">
        <RiskCard report={report} />
        <PriceCard report={report} />
        <SavingsCard report={report} />
      </section>

      {report.demo && (
        <div className="glass animate-fade-up border-sev-medium/40 px-5 py-3 text-center text-sm text-sev-medium">
          Демо-звіт: AI вимкнено, бо в .env не задано LLM_API_KEY. Пункти нижче — загальний чек-лист, а не висновки про це авто.
        </div>
      )}

      {/* Звіти, створені до появи вердикту по ціні, його не мають. */}
      {report.price.verdict && <PriceVerdict price={report.price} />}

      <p className="glass animate-fade-up px-6 py-5 leading-relaxed text-ice/90" style={{ animationDelay: '300ms' }}>
        {report.summary}
        {report.photosAnalyzed > 0 && (
          <span className="mt-2 block text-sm text-mist">
            AI переглянув {report.photosAnalyzed} з {photos.length} фото оголошення.
          </span>
        )}
      </p>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">
            Знахідки · {visible.length}
            {selectedZone && ` · ${CAR_ZONE_LABELS[selectedZone]}`}
          </h2>
          {selectedZone && (
            <button onClick={() => setSelectedZone(null)} className="text-sm text-mist underline underline-offset-4 hover:text-ice">
              Показати всі
            </button>
          )}
        </div>
        {visible.map((finding, index) => (
          <FindingCard
            key={`${finding.zone}-${finding.title}`}
            finding={finding}
            index={index}
            photos={photos}
            onOpenPhoto={setOpenPhoto}
          />
        ))}
      </section>

      {openPhoto !== null && (
        <PhotoLightbox
          photos={photos}
          index={openPhoto}
          onClose={() => setOpenPhoto(null)}
          onMove={(delta) => setOpenPhoto((n) => (n === null ? n : ((n - 1 + delta + photos.length) % photos.length) + 1))}
        />
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <ListCard title="Що добре" items={report.strengths} marker="+" />
        <ListCard title="Запитати в продавця" items={report.questionsForSeller} marker="?" />
      </section>
    </div>
  );
}

function RiskCard({ report }: { report: AnalysisReport }) {
  const score = useCountUp(report.riskScore, 1400, 400);
  const verdict = VERDICT[report.verdict];
  const circumference = 2 * Math.PI * 40;
  return (
    <div className="glass animate-fade-up flex items-center gap-5 p-5" style={{ animationDelay: '100ms' }}>
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" stroke="white" strokeOpacity="0.1" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          stroke={verdict.color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
        <text x="50" y="50" transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="central" className="fill-ice text-2xl font-bold">
          {score}
        </text>
      </svg>
      <div>
        <p className="eyebrow">Ризик</p>
        <p className="mt-1 text-lg font-semibold" style={{ color: verdict.color }}>
          {verdict.label}
        </p>
        <p className="text-sm text-mist">з 100 можливих</p>
      </div>
    </div>
  );
}

function PriceCard({ report }: { report: AnalysisReport }) {
  const { price } = report;
  const offer = useCountUp(price.suggestedOfferUsd, 1400, 500);
  const min = Math.min(price.fairMinUsd, price.suggestedOfferUsd, price.listedPriceUsd);
  const max = Math.max(price.fairMaxUsd, price.listedPriceUsd);
  const pos = (value: number) => `${((value - min) / Math.max(1, max - min)) * 100}%`;
  return (
    <div className="glass animate-fade-up p-5" style={{ animationDelay: '200ms' }}>
      <p className="eyebrow">Пропонуйте</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{usd(offer)}</p>
      <div className="relative mt-4 h-2 rounded-full bg-white/10">
        <div
          className="absolute h-full rounded-full bg-sev-low/50"
          style={{ left: pos(price.fairMinUsd), width: `calc(${pos(price.fairMaxUsd)} - ${pos(price.fairMinUsd)})` }}
        />
        <Marker left={pos(price.listedPriceUsd)} color="var(--color-sev-high)" />
        <Marker left={pos(price.suggestedOfferUsd)} color="var(--color-ice)" />
      </div>
      <div className="mt-2 flex justify-between text-xs text-mist">
        <span>Ринок {usd(price.fairMinUsd)}–{usd(price.fairMaxUsd)}</span>
        <span>В оголошенні {usd(price.listedPriceUsd)}</span>
      </div>
    </div>
  );
}

function Marker({ left, color }: { left: string; color: string }) {
  return (
    <span
      className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-night"
      style={{ left, background: color }}
    />
  );
}

function SavingsCard({ report }: { report: AnalysisReport }) {
  const discount = Math.max(0, report.price.listedPriceUsd - report.price.suggestedOfferUsd);
  const repairs = report.findings.reduce((sum, f) => sum + (f.repairCostMaxUsd ?? 0), 0);
  const animatedDiscount = useCountUp(discount, 1400, 600);
  return (
    <div className="glass animate-fade-up p-5" style={{ animationDelay: '300ms' }}>
      <p className="eyebrow">Можна виторгувати</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-sev-low">−{usd(animatedDiscount)}</p>
      <p className="mt-3 text-sm text-mist">
        Ремонт за знахідками: до {usd(repairs)}
        <br />
        {report.findings.length} аргументів для торгу
      </p>
    </div>
  );
}

/** Номери фото, на які посилається AI: «фото 3», «фото 12, 14», «фото 5 і 6». */
function photoNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const [, list] of text.matchAll(/фото\s*№?\s*((?:\d+(?:\s*(?:,|і|та|-|–)\s*)?)+)/gi)) {
    for (const value of list.match(/\d+/g) ?? []) numbers.add(Number(value));
  }
  return [...numbers];
}

function EvidencePhotos({ text, photos, onOpen }: { text: string; photos: string[]; onOpen: (n: number) => void }) {
  const numbers = photoNumbers(text).filter((n) => n >= 1 && n <= photos.length);
  if (!numbers.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {numbers.slice(0, 6).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onOpen(n)}
          className="group relative h-20 w-28 overflow-hidden rounded-xl border border-white/15"
          title={`Відкрити фото ${n}`}
        >
          <img src={photos[n - 1]} alt={`Фото ${n}`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
          <span className="absolute bottom-1 left-1 rounded-md bg-night/80 px-1.5 text-[11px] font-semibold">{n}</span>
        </button>
      ))}
    </div>
  );
}

/** Повноекранний перегляд фото оголошення зі стрілками. */
function PhotoLightbox({ photos, index, onClose, onMove }: { photos: string[]; index: number; onClose: () => void; onMove: (delta: number) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onMove(1);
      if (event.key === 'ArrowLeft') onMove(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onMove]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/90 p-4 backdrop-blur" onClick={onClose}>
      <img
        src={photos[index - 1]}
        alt={`Фото ${index}`}
        className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
      <span className="absolute left-1/2 top-5 -translate-x-1/2 text-sm text-mist">
        Фото {index} з {photos.length}
      </span>
      {[-1, 1].map((delta) => (
        <button
          key={delta}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMove(delta);
          }}
          className={`absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl ${delta < 0 ? 'left-4' : 'right-4'}`}
          aria-label={delta < 0 ? 'Попереднє фото' : 'Наступне фото'}
        >
          {delta < 0 ? '‹' : '›'}
        </button>
      ))}
    </div>
  );
}

function FindingCard({
  finding,
  index,
  photos,
  onOpenPhoto,
}: {
  finding: ReportFinding;
  index: number;
  photos: string[];
  onOpenPhoto: (n: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const color = SEVERITY_COLOR[finding.severity];
  const cost =
    finding.repairCostMinUsd !== null && finding.repairCostMaxUsd !== null
      ? `${usd(finding.repairCostMinUsd)}–${usd(finding.repairCostMaxUsd)}`
      : null;

  const copy = async () => {
    await navigator.clipboard.writeText(finding.negotiation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className="glass animate-fade-up overflow-hidden" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ background: color }} />
        <div className="flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full px-2.5 py-1 font-semibold text-night" style={{ background: color }}>
              {SEVERITY_LABEL[finding.severity]}
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-mist">{CAR_ZONE_LABELS[finding.zone]}</span>
            {cost && <span className="ml-auto font-semibold text-ice">Ремонт {cost}</span>}
          </div>
          <h3 className="mt-3 text-lg font-semibold">{finding.title}</h3>
          <p className="mt-1 text-ice/80">{finding.detail}</p>
          <p className="mt-2 border-l-2 border-white/20 pl-3 text-sm italic text-mist">{finding.evidence}</p>
          <EvidencePhotos text={`${finding.evidence} ${finding.detail}`} photos={photos} onOpen={onOpenPhoto} />
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-white/[0.06] p-4">
            <p className="flex-1 text-sm">
              <span className="eyebrow mr-2">Скажіть продавцю</span>«{finding.negotiation}»
            </p>
            <button onClick={copy} className="btn btn-ghost px-3 py-1.5 text-xs">
              {copied ? 'Скопійовано' : 'Копіювати'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ListCard({ title, items, marker }: { title: string; items: string[]; marker: string }) {
  if (!items.length) return null;
  return (
    <div className="glass animate-fade-up p-5">
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-ice/90">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
              {marker}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
