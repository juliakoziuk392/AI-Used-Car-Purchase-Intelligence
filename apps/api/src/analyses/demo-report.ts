import type { AnalysisReport, ParsedListing, ReportFinding } from '@carintel/shared';
import type { Listing } from '../database/models';

/**
 * Демо-звіт без LLM: щоб UI звіту можна було побачити без API-ключа.
 * Знахідки — загальні пункти огляду для будь-якого вживаного авто, а не висновки про це оголошення.
 */
export function buildDemoReport(listing: Listing, parsed: ParsedListing): AnalysisReport {
  const price = parsed.priceUsd ?? listing.price ?? 0;
  const mileage = parsed.mileageKm ?? listing.mileage ?? 0;
  const year = listing.vehicle?.year ?? parsed.year ?? new Date().getFullYear();
  const age = Math.max(0, new Date().getFullYear() - year);

  const findings: ReportFinding[] = [
    {
      zone: 'engine',
      severity: mileage > 150_000 ? 'high' : 'medium',
      title: 'Діагностика двигуна',
      detail: mileage
        ? `При пробігу ${mileage.toLocaleString('uk-UA')} км варто перевірити компресію, течі масла й історію ТО.`
        : 'Пробіг не вказано — перевірте компресію, течі масла й історію ТО.',
      evidence: 'демо: загальний пункт огляду',
      source: 'model_knowledge',
      repairCostMinUsd: 300,
      repairCostMaxUsd: 1500,
      negotiation: 'Без підтвердженої історії ТО двигуна я закладаю діагностику й можливий ремонт у ціну.',
    },
    {
      zone: 'body',
      severity: 'medium',
      title: 'Перевірити ЛФП товщиноміром',
      detail: 'Різні відтінки або товщина фарби на деталях вказують на ремонт кузова.',
      evidence: 'демо: загальний пункт огляду',
      source: 'photos',
      repairCostMinUsd: 200,
      repairCostMaxUsd: 800,
      negotiation: 'Якщо товщиномір покаже перефарбовані деталі, попрошу знижку на їх вартість.',
    },
    {
      zone: 'front_wheel',
      severity: 'low',
      title: 'Стан передньої підвіски',
      detail: 'Сайлентблоки й кульові опори — витратні вузли, перевіряються на підйомнику.',
      evidence: 'демо: загальний пункт огляду',
      source: 'model_knowledge',
      repairCostMinUsd: 150,
      repairCostMaxUsd: 500,
      negotiation: 'Підвіску доведеться обслуговувати найближчим часом — врахуймо це в ціні.',
    },
    {
      zone: 'transmission',
      severity: age > 8 ? 'medium' : 'low',
      title: 'Робота коробки передач',
      detail: 'Перевірити поштовхи при перемиканні й стан масла в КПП.',
      evidence: 'демо: загальний пункт огляду',
      source: 'model_knowledge',
      repairCostMinUsd: 200,
      repairCostMaxUsd: 2500,
      negotiation: 'Якщо заміна масла в КПП не підтверджена, закладаю її вартість у торг.',
    },
    {
      zone: 'interior',
      severity: 'low',
      title: 'Знос салону проти пробігу',
      detail: 'Знос керма, педалей і водійського сидіння має відповідати заявленому пробігу.',
      evidence: 'демо: загальний пункт огляду',
      source: 'photos',
      repairCostMinUsd: null,
      repairCostMaxUsd: null,
      negotiation: 'Знос салону виглядає більшим, ніж для такого пробігу — це привід для знижки.',
    },
    {
      zone: 'documents',
      severity: 'medium',
      title: 'Історія по VIN',
      detail: 'Перевірити ДТП, кількість власників і пробіг за VIN-звітом.',
      evidence: parsed.vin ? `VIN ${parsed.vin}` : 'VIN в оголошенні не вказано',
      source: 'description',
      repairCostMinUsd: null,
      repairCostMaxUsd: null,
      negotiation: 'Готовий купити після чистого VIN-звіту — або зі знижкою, якщо там будуть ДТП.',
    },
  ];

  const discount = Math.round((price * 0.06) / 100) * 100;
  return {
    demo: true,
    photoViews: [],
    heroPhoto: parsed.photos.length ? 1 : null,
    photosAnalyzed: 0,
    vehicle: {
      bodyType: null,
      colorHex: null,
      make: parsed.make,
      model: parsed.model,
      generation: null,
      year: parsed.year,
      engine: null,
      gearbox: null,
      mileageKm: parsed.mileageKm,
    },
    riskScore: Math.min(85, 30 + Math.round(mileage / 10_000) + age * 2),
    verdict: 'negotiate',
    summary:
      'Це демо-звіт: AI-аналіз вимкнено, бо не задано LLM_API_KEY. Нижче — загальні пункти огляду, а не висновки про це оголошення.',
    strengths: ['Оголошення з фото й описом', parsed.vin ? 'Вказано VIN' : 'Можна запросити VIN у продавця'],
    findings,
    price: {
      listedPriceUsd: price,
      verdict: 'overpriced',
      marketPriceUsd: price - discount,
      fairMinUsd: price - discount * 2,
      fairMaxUsd: price - Math.round(discount / 2 / 100) * 100,
      suggestedOfferUsd: price - discount * 2,
      headline: 'Демо: це не оцінка ринку, а умовні −6% від ціни оголошення. Справжню оцінку дасть AI.',
      arguments: [
        'Демо-аргумент: витрати на діагностику й обслуговування після покупки знижують вартість.',
        'Демо-аргумент: без перевірки по VIN ризик прихованих ДТП закладається в ціну.',
        'Для реальної оцінки ринку додай LLM_API_KEY у .env.',
      ],
    },
    questionsForSeller: [
      'Чи є сервісна історія та чеки з ТО?',
      'Скільки власників було і чи були ДТП?',
      'Чи можна провести огляд на СТО за мій рахунок?',
    ],
  };
}
