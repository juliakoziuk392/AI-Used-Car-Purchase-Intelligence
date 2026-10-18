import type { PriceAssessment, PriceVerdict as Verdict } from '@carintel/shared';
import { useCountUp } from '../../lib/useCountUp';

const VERDICT: Record<Verdict, { label: string; color: string }> = {
  fair: { label: 'Ціна виправдана', color: 'var(--color-sev-low)' },
  overpriced: { label: 'Ціна завищена', color: 'var(--color-sev-high)' },
  underpriced: { label: 'Підозріло дешево', color: 'var(--color-sev-medium)' },
};

const usd = (value: number) => `$${value.toLocaleString('uk-UA')}`;

/** Головна відповідь звіту: чи виправдана названа ціна і скільки авто коштує насправді. */
export function PriceVerdict({ price }: { price: PriceAssessment }) {
  const verdict = VERDICT[price.verdict];
  const market = useCountUp(price.marketPriceUsd, 1600, 300);
  const diff = price.listedPriceUsd - price.marketPriceUsd;
  const diffPercent = Math.round((Math.abs(diff) / price.marketPriceUsd) * 100);

  return (
    <section className="glass animate-fade-up overflow-hidden" style={{ animationDelay: '150ms' }}>
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
        <div>
          <p className="eyebrow">Чи виправдана ціна</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl" style={{ color: verdict.color }}>
            {verdict.label}
          </h2>
          <p className="mt-2 max-w-xl text-lg text-ice/90">{price.headline}</p>
        </div>

        <div className="flex items-stretch gap-3">
          <PriceTile label="Просять" value={usd(price.listedPriceUsd)} muted />
          <div className="flex flex-col items-center justify-center px-1 text-center">
            <span className="text-2xl text-mist">→</span>
            {diff !== 0 && (
              <span className="mt-1 whitespace-nowrap text-xs font-semibold" style={{ color: verdict.color }}>
                {diff > 0 ? '+' : '−'}
                {usd(Math.abs(diff))}
                <br />
                {diffPercent}%
              </span>
            )}
          </div>
          <PriceTile label="Реальна ціна" value={usd(market)} accent={verdict.color} />
        </div>
      </div>

      {price.arguments.length > 0 && (
        <div className="border-t border-white/10 bg-black/10 p-6 md:px-8">
          <p className="eyebrow">Чому</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {price.arguments.map((argument, index) => (
              <li
                key={argument}
                className="animate-fade-up flex gap-3 text-ice/90"
                style={{ animationDelay: `${400 + index * 90}ms` }}
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: verdict.color }}
                />
                {argument}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-mist">
            Оцінка AI на основі знань про ринок України, а не живих оголошень. Діапазон ринку: {usd(price.fairMinUsd)}–
            {usd(price.fairMaxUsd)}.
          </p>
        </div>
      )}
    </section>
  );
}

function PriceTile({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: string }) {
  return (
    <div
      className="flex min-w-[8.5rem] flex-col justify-center rounded-2xl border px-4 py-3"
      style={{ borderColor: accent ?? 'rgb(255 255 255 / 0.12)', background: accent ? 'rgb(255 255 255 / 0.06)' : undefined }}
    >
      <span className="eyebrow">{label}</span>
      <span className={`mt-1 text-2xl font-bold tabular-nums ${muted ? 'text-mist line-through decoration-1' : ''}`}>
        {value}
      </span>
    </div>
  );
}
