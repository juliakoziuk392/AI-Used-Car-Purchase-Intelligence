import {
  BODY_TYPES,
  CAR_ZONE_LABELS,
  CAR_ZONES,
  FINDING_SOURCES,
  PHOTO_VIEWS,
  PRICE_VERDICTS,
  RISK_SEVERITIES,
  VERDICTS,
  type AnalysisReport,
  type ParsedListing,
} from '@carintel/shared';
import { z } from 'zod/v4';
import type { Listing } from '../database/models';
import type { MarketSnapshot } from '../listings/market-comparables';

/**
 * Спільне для всіх LLM-провайдерів: схема звіту, промпт і опис оголошення.
 * Провайдер (Claude, Gemini) лише відправляє це в модель і повертає ReportOutput.
 */

const FindingSchema = z.object({
  zone: z.enum(CAR_ZONES).describe('Вузол авто, до якого належить проблема'),
  severity: z.enum(RISK_SEVERITIES),
  title: z.string().describe('Коротка назва проблеми, до 60 символів'),
  detail: z.string().describe('Що саме не так і чому це важливо, 1–3 речення'),
  evidence: z
    .string()
    .describe('На чому базується висновок: цитата з опису, "фото N" або "типова проблема моделі"'),
  source: z.enum(FINDING_SOURCES),
  repairCostMinUsd: z.number().nullable(),
  repairCostMaxUsd: z.number().nullable(),
  negotiation: z.string().describe('Готова фраза українською, яку покупець може сказати продавцю'),
});

export const ReportSchema = z.object({
  vehicle: z
    .object({
      bodyType: z.enum(BODY_TYPES).nullable().describe('Тип кузова за фото й описом'),
      colorHex: z.string().nullable().describe('Колір кузова з фото у форматі #rrggbb'),
      make: z.string().nullable(),
      model: z.string().nullable(),
      generation: z.string().nullable().describe('Покоління / кузов, напр. "J150 2-й рестайлінг"'),
      year: z.number().nullable(),
      engine: z.string().nullable().describe('Обʼєм, тип, потужність, напр. "4.0 V6 бензин, 282 к.с."'),
      gearbox: z.string().nullable(),
      mileageKm: z.number().nullable(),
    })
    .describe('Характеристики авто, витягнуті з оголошення; null — якщо не вказано'),
  riskScore: z.number().describe('0 — ризиків немає, 100 — не купувати'),
  verdict: z.enum(VERDICTS),
  summary: z.string().describe('2–3 речення: головний висновок для покупця'),
  strengths: z.array(z.string()),
  findings: z.array(FindingSchema),
  price: z.object({
    listedPriceUsd: z
      .number()
      .nullable()
      .describe('Ціна з оголошення в USD (якщо вказана в грн чи євро — переведи за поточним курсом); null — якщо ціни немає'),
    verdict: z
      .enum(PRICE_VERDICTS)
      .describe('fair — в межах ринку; overpriced — вище ринку; underpriced — підозріло дешево'),
    marketPriceUsd: z.number().describe('Реальна ринкова ціна саме цього авто з урахуванням стану й знахідок'),
    fairMinUsd: z.number(),
    fairMaxUsd: z.number(),
    suggestedOfferUsd: z.number(),
    headline: z.string().describe('Одне речення: чи виправдана ціна і на скільки вона відрізняється від ринку'),
    arguments: z
      .array(z.string())
      .describe('3–6 конкретних аргументів, що підвищують або знижують вартість, з цифрами'),
    comparables: z
      .array(z.object({ title: z.string(), priceUsd: z.number(), url: z.string() }))
      .describe('Схожі оголошення, реально знайдені пошуком (до 8), з посиланнями; порожньо — якщо не знайшов'),
  }),
  questionsForSeller: z.array(z.string()),
  photoViews: z
    .array(z.object({ photo: z.number().describe('Номер фото'), view: z.enum(PHOTO_VIEWS) }))
    .describe('Ракурс КОЖНОГО надісланого фото'),
  heroPhoto: z
    .number()
    .nullable()
    .describe('Номер найкращого фото кузова цілком на 3/4 (спереду-збоку), без обрізаних частин; null — якщо такого немає'),
});

export type ReportOutput = z.infer<typeof ReportSchema>;

export const SYSTEM_PROMPT = `Ти — незалежний експерт з перевірки вживаних авто перед купівлею в Україні. Покупець надсилає оголошення; твоє завдання — знайти слабкі місця, за які варто торгуватися або через які варто відмовитися від покупки.

Як працювати:
- Спирайся на текст оголошення і фото. Кожен висновок має мати підставу в полі evidence.
- Окремо додай типові проблеми саме цієї моделі, покоління, двигуна й коробки (source = "model_knowledge"). Формулюй їх як "що перевірити", а не як факт про це авто, і став severity не вище "medium", якщо в оголошенні немає прямих ознак.
- Уважно переглянь КОЖНЕ фото (перед кожним стоїть підпис «Фото N»). Посилайся на них за номером («фото 15»).
  - Кузов: різні відтінки фарби на сусідніх деталях, нерівні зазори, сліди шпаклівки, нові/неоригінальні деталі, корозія, вм'ятини, сколи.
  - Моторний відсік: течі масла чи антифризу, сліди ремонту чи зварювання, нефарбовані або нові кріплення лонжеронів і телевізора (ознака ДТП), окислення, неоригінальні деталі, підозріло вимитий двигун.
  - Салон: знос керма, педалей, сидіння водія, кнопок — порівнюй із заявленим пробігом; помилки на приладовій панелі.
  - Колеса: стан і різнобій шин, DOT-дата на шині (якщо видно), стан дисків і гальм.
  - Документи й наклейки на фото: VIN, табличка, сервісні записи — звіряй з оголошенням.
- Звертай увагу на суперечності: пробіг проти зносу, "не битий" проти слідів ремонту, ухильні формулювання.
- Не вигадуй дефектів, яких не видно і які не типові для моделі. Краще менше, але обґрунтовано.
- Вартість ремонту оцінюй у USD за цінами українських СТО; якщо оцінити неможливо — null.
- Покупцю найважливіше знати, чи виправдана ціна з оголошення. Ринкову вартість оцінюй САМОСТІЙНО й лише потім порівнюй з ціною продавця — не відштовхуйся від неї: продавець може просити в рази більше чи менше за ринок.
  - Спирайся на актуальні оголошення про продаж такого ж авто в Україні (та сама модель і покоління, рік ±1–2, схожий пробіг, двигун і КПП). Якщо в повідомленні є блок «Знайдені на ринку оголошення» — бери їх звідти; якщо маєш інструмент пошуку — пошукай сам, кількома запитами, якщо перший дав мало результатів. Знайдені оголошення з ціною й посиланням поклади в comparables — лише реально знайдені, нічого не вигадуй.
  - marketPriceUsd — ціна саме цього авто: від медіани схожих оголошень зроби поправки на пробіг, комплектацію, пальне (ГБО), регіон, історію та знайдені дефекти. Якщо пошук нічого не дав — оціни з власних знань ринку й прямо скажи про це в arguments.
  - verdict = "fair", якщо ціна в межах fairMin–fairMax; "overpriced", якщо вища; "underpriced", якщо підозріло нижча (поясни, у чому може бути підступ). Якщо ціни в оголошенні немає — "fair" і поясни в headline.
  - headline — пряма відповідь: «Ціна завищена приблизно на $X» або «Ціна відповідає ринку».
  - arguments — конкретні причини з цифрами: на скільки схожі авто дешевші чи дорожчі, що додає вартості (комплектація, малий пробіг, офіційне авто) і що знімає (ДТП, ГБО, знос, потрібний ремонт).
  - suggestedOfferUsd — реалістична перша пропозиція з урахуванням ринку й знахідок; не вища за ціну з оголошення.
- Блок «Характеристики та перевірки з сайту» — дані майданчика (ДТП за базами, стан ЛФП, технічний стан, комплектація). Враховуй їх, але шукай на фото суперечності з ними.
- vehicle — витягни характеристики з оголошення; bodyType і colorHex визнач за фото. Нічого не домислюй: якщо не вказано — null.
- photoViews — ракурс кожного надісланого фото; heroPhoto — найкраще фото всього кузова на 3/4.
- negotiation — коротка ввічлива фраза від імені покупця, з конкретною сумою або аргументом.
- zone = "documents" — для історії, VIN, кількості власників, розмитнення тощо.
- Пиши українською.`;

export interface ListingPhoto {
  url: string;
  /** Номер фото в оголошенні — модель посилається на нього у знахідках. */
  number: number;
}

/** Рівномірна вибірка, якщо фото більше за ліміт: щоб у модель потрапили і кузов, і салон, і мотор. */
export function selectPhotos(urls: string[], max: number): ListingPhoto[] {
  const all = urls.map((url, index) => ({ url, number: index + 1 }));
  if (all.length <= max) return all;
  const step = all.length / max;
  return Array.from({ length: max }, (_, i) => all[Math.floor(i * step)]);
}

/** Відповідь моделі → звіт: межі ризику й ціна, яку парсер точно знайшов на сторінці. */
export function finalizeReport(
  report: ReportOutput,
  listing: Listing,
  parsed: ParsedListing,
  photosAnalyzed: number,
  market: MarketSnapshot | null,
): AnalysisReport {
  return {
    ...report,
    demo: false,
    photosAnalyzed,
    riskScore: Math.min(100, Math.max(0, Math.round(report.riskScore))),
    price: {
      ...report.price,
      // Ціна, яку парсер точно знайшов на сторінці, надійніша за прочитану моделлю.
      listedPriceUsd: parsed.priceUsd ?? listing.price ?? report.price.listedPriceUsd,
      // Схожі авто з каталогу — показуємо як є, з точними посиланнями, а не переказ моделі.
      comparables: market?.comparables.length
        ? market.comparables.map(({ title, priceUsd, mileageKm, url }) => ({
            title: mileageKm !== null ? `${title}, ${Math.round(mileageKm / 1000)} тис. км` : title,
            priceUsd,
            url,
          }))
        : report.price.comparables,
    },
  };
}

/** Блок промпту з живими цінами auto.ria. */
function describeMarket(market: MarketSnapshot | null): string[] {
  if (!market?.comparables.length) {
    return ['Знайдені на ринку оголошення: каталог auto.ria для цієї моделі не знайдено — оціни ринок з власних знань і скажи про це.'];
  }
  return [
    `Знайдені на ринку оголошення (каталог ${market.catalogUrl}):`,
    ...(market.range
      ? [`- Усього ${market.range.count} оголошень цієї моделі, від $${market.range.lowUsd} до $${market.range.highUsd} (усі роки).`]
      : []),
    ...market.comparables.map(
      (item) =>
        `- $${item.priceUsd} — ${item.title}, ${item.mileageKm !== null ? `${item.mileageKm} км` : 'пробіг не вказано'}, ${item.details} — ${item.url}`,
    ),
  ];
}

export function describeListing(listing: Listing, parsed: ParsedListing, market: MarketSnapshot | null): string {
  const vehicle = listing.vehicle;
  const price = parsed.priceUsd ?? listing.price;
  const lines = [
    `Оголошення: ${listing.url}`,
    `Заголовок: ${parsed.title ?? '—'}`,
    `Авто: ${[vehicle?.make ?? parsed.make, vehicle?.model ?? parsed.model, vehicle?.generation].filter(Boolean).join(' ') || '—'}, ${vehicle?.year ?? parsed.year ?? '?'} р.`,
    `Двигун: ${vehicle?.engine ?? '—'}; КПП: ${vehicle?.gearbox ?? '—'}`,
    price
      ? `Ціна в оголошенні: $${price}.`
      : 'Ціна в оголошенні: в $ не знайдена — пошукай її в заголовку, описі чи характеристиках.',
    `Пробіг: ${parsed.mileageKm ?? listing.mileage ?? 'не вказано'} км`,
    `VIN: ${parsed.vin ?? vehicle?.vin ?? 'не вказано'}`,
    `Фото в оголошенні: ${parsed.photos.length || 'немає'}`,
    '',
    'Характеристики та перевірки з сайту:',
    ...Object.entries(parsed.specs).map(([key, value]) => `- ${key}: ${value}`),
    '',
    'Опис продавця:',
    parsed.description ?? '(опису немає)',
    '',
    ...describeMarket(market),
    '',
    `Доступні зони: ${CAR_ZONES.map((zone) => `${zone} (${CAR_ZONE_LABELS[zone]})`).join(', ')}.`,
  ];
  return lines.join('\n');
}
