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
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod/v4';
import type { Listing } from '../database/models';
import { buildDemoReport } from './demo-report';

const MODEL = 'claude-opus-5-5';
/** Скільки фото оголошення надсилати в модель (~1.5k токенів за фото). Змінюється через LLM_MAX_PHOTOS. */
const DEFAULT_MAX_PHOTOS = 40;
const DEMO_DELAY_MS = 4000;

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

const ReportSchema = z.object({
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
    listedPriceUsd: z.number().describe('Ціна, яку назвав покупець'),
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

const SYSTEM_PROMPT = `Ти — незалежний експерт з перевірки вживаних авто перед купівлею в Україні. Покупець надсилає оголошення; твоє завдання — знайти слабкі місця, за які варто торгуватися або через які варто відмовитися від покупки.

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
- Покупцю найважливіше знати, чи виправдана названа ціна. Оціни ринкову вартість цього авто в Україні з урахуванням покоління, року, пробігу, двигуна, комплектації, пального (ГБО), регіону, історії та знайдених дефектів.
  - verdict = "fair", якщо ціна в межах fairMin–fairMax; "overpriced", якщо вища; "underpriced", якщо підозріло нижча (поясни, у чому може бути підступ).
  - headline — пряма відповідь: «Ціна завищена приблизно на $X» або «Ціна відповідає ринку».
  - arguments — конкретні причини з цифрами: що додає вартості (комплектація, малий пробіг, офіційне авто) і що знімає (ДТП, ГБО, знос, потрібний ремонт).
  - Це оцінка на основі твоїх знань про ринок, а не живих оголошень — не вигадуй конкретних «схожих оголошень».
  - suggestedOfferUsd — реалістична перша пропозиція з урахуванням знахідок.
- Блок «Характеристики та перевірки з сайту» — дані майданчика (ДТП за базами, стан ЛФП, технічний стан, комплектація). Враховуй їх, але шукай на фото суперечності з ними.
- vehicle — витягни характеристики з оголошення; bodyType і colorHex визнач за фото. Нічого не домислюй: якщо не вказано — null.
- photoViews — ракурс кожного надісланого фото; heroPhoto — найкраще фото всього кузова на 3/4.
- negotiation — коротка ввічлива фраза від імені покупця, з конкретною сумою або аргументом.
- zone = "documents" — для історії, VIN, кількості власників, розмитнення тощо.
- Пиши українською.`;

@Injectable()
export class CarAnalystService {
  private readonly logger = new Logger(CarAnalystService.name);
  private readonly client: Anthropic | null;
  private readonly maxPhotos: number;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('LLM_API_KEY') || config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    this.maxPhotos = Number(config.get('LLM_MAX_PHOTOS', DEFAULT_MAX_PHOTOS));
    if (!this.client) this.logger.warn('LLM_API_KEY не задано — звіти будуються в демо-режимі');
  }

  /** Рівномірна вибірка, якщо фото більше за ліміт: щоб у модель потрапили і кузов, і салон, і мотор. */
  private selectPhotos(urls: string[]) {
    const all = urls.map((url, index) => ({ url, number: index + 1 }));
    if (all.length <= this.maxPhotos) return all;
    const step = all.length / this.maxPhotos;
    return Array.from({ length: this.maxPhotos }, (_, i) => all[Math.floor(i * step)]);
  }

  async analyze(listing: Listing, parsed: ParsedListing): Promise<AnalysisReport> {
    if (!this.client) {
      // Без LLM крок миттєвий — невелика пауза, щоб у UI було видно етап аналізу.
      await new Promise((resolve) => setTimeout(resolve, DEMO_DELAY_MS));
      return buildDemoReport(listing, parsed);
    }

    // Кожне фото підписуємо його номером в оголошенні — модель посилається на них у знахідках.
    const selected = this.selectPhotos(parsed.photos);
    const photos = selected.flatMap(({ url, number }): Anthropic.Beta.BetaContentBlockParam[] => [
      { type: 'text', text: `Фото ${number}:` },
      { type: 'image', source: { type: 'url', url } },
    ]);

    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Якщо модель відмовить, сервер сам перезапустить запит на резервній моделі.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(ReportSchema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: describeListing(listing, parsed) }, ...photos],
        },
      ],
    });

    if (response.stop_reason === 'refusal') throw new Error('Модель відмовилась аналізувати це оголошення');
    if (response.stop_reason === 'max_tokens') throw new Error('Відповідь моделі обрізана (max_tokens)');
    if (!response.parsed_output) throw new Error('Модель повернула відповідь не за схемою');

    const report = response.parsed_output;
    return {
      ...report,
      demo: false,
      photosAnalyzed: selected.length,
      riskScore: Math.min(100, Math.max(0, Math.round(report.riskScore))),
      // Ціну, яку ввів користувач, не довіряємо переписувати моделі.
      price: { ...report.price, listedPriceUsd: listing.price },
    };
  }
}

function describeListing(listing: Listing, parsed: ParsedListing): string {
  const vehicle = listing.vehicle;
  const pagePrice =
    parsed.priceUsd && parsed.priceUsd !== listing.price ? ` (в оголошенні вказано $${parsed.priceUsd})` : '';
  const lines = [
    `Оголошення: ${listing.url}`,
    `Заголовок: ${parsed.title ?? '—'}`,
    `Авто: ${[vehicle?.make ?? parsed.make, vehicle?.model ?? parsed.model, vehicle?.generation].filter(Boolean).join(' ') || '—'}, ${vehicle?.year ?? parsed.year ?? '?'} р.`,
    `Двигун: ${vehicle?.engine ?? '—'}; КПП: ${vehicle?.gearbox ?? '—'}`,
    `Ціна, яку назвали покупцю: $${listing.price}${pagePrice}. Оціни, чи вона виправдана.`,
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
    `Доступні зони: ${CAR_ZONES.map((zone) => `${zone} (${CAR_ZONE_LABELS[zone]})`).join(', ')}.`,
  ];
  return lines.join('\n');
}
