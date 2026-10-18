import { USER_AGENT } from './listing-parser';

/** Скільки сторінок каталогу моделі читаємо (~20 оголошень на сторінці). */
const CATALOG_PAGES = 4;
const MAX_COMPARABLES = 10;
const MIN_COMPARABLES = 4;

export interface MarketComparable {
  title: string;
  year: number | null;
  priceUsd: number;
  mileageKm: number | null;
  /** КПП, пальне, місто — як на картці оголошення. */
  details: string;
  url: string;
}

export interface MarketSnapshot {
  catalogUrl: string;
  /** Діапазон цін усіх оголошень цієї моделі на auto.ria. */
  range: { lowUsd: number; highUsd: number; count: number } | null;
  comparables: MarketComparable[];
}

interface Target {
  make: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
  /** Саме оголошення не порівнюємо з собою. */
  excludeUrl: string;
}

/**
 * Живі ціни ринку з каталогу моделі на auto.ria: схожі за роком і пробігом авто з цінами й посиланнями.
 * Не залежить від LLM-провайдера; невдача (немає моделі в каталозі, сайт недоступний) — null.
 */
export async function findMarketComparables(target: Target): Promise<MarketSnapshot | null> {
  const catalogUrl = `https://auto.ria.com/uk/legkovie/${slug(target.make)}/${slug(target.model)}/`;
  const pages = await Promise.all(
    Array.from({ length: CATALOG_PAGES }, (_, i) => fetchCatalogPage(i === 0 ? catalogUrl : `${catalogUrl}?page=${i + 1}`)),
  );
  if (!pages[0]) return null;

  const excludeId = listingId(target.excludeUrl);
  const seen = new Set<string>();
  const all = pages
    .flatMap((html) => (html ? parseCatalogItems(html) : []))
    .filter((item) => {
      const id = listingId(item.url);
      if (!id || id === excludeId || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  return { catalogUrl, range: parseRange(pages[0]), comparables: pickClosest(all, target) };
}

/** Найближчі за роком (±2, а якщо мало — ±4), далі — за пробігом. */
function pickClosest(items: MarketComparable[], target: Target): MarketComparable[] {
  if (target.year === null) return items.slice(0, MAX_COMPARABLES);
  const within = (years: number) => items.filter((item) => item.year !== null && Math.abs(item.year - target.year!) <= years);
  const pool = within(2).length >= MIN_COMPARABLES ? within(2) : within(4);
  const distance = (item: MarketComparable) =>
    Math.abs(item.year! - target.year!) * 40_000 +
    (target.mileageKm !== null && item.mileageKm !== null ? Math.abs(item.mileageKm - target.mileageKm) : 50_000);
  return pool.sort((a, b) => distance(a) - distance(b)).slice(0, MAX_COMPARABLES);
}

async function fetchCatalogPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'uk,ru;q=0.8,en;q=0.5' },
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok ? (await response.text()).replace(/\\u002F/g, '/') : null;
  } catch {
    return null;
  }
}

/**
 * Картки оголошень зі стану сторінки каталогу:
 * …"title":{"content":"Daewoo Lanos 2003"}…"price":{"UAH":…,"USD":2350},"basicInfo":[…]…"link":"https://…".
 */
function parseCatalogItems(html: string): MarketComparable[] {
  const items: MarketComparable[] = [];
  for (const match of html.matchAll(/"price":\{"UAH":\d+,"USD":(\d+)\},"basicInfo":\[/g)) {
    const at = match.index;
    const before = html.slice(Math.max(0, at - 4000), at);
    const after = html.slice(at, at + 5000);

    const title = [...before.matchAll(/"title":\{"content":"([^"]+)"\}/g)].at(-1)?.[1];
    const url = after.match(/"link":"(https:\/\/auto\.ria\.com\/uk\/auto_[^"]+\.html)"/)?.[1];
    if (!title || !url) continue;

    const info = after.slice(0, after.indexOf('],"') + 1);
    const facts = [...info.matchAll(/"content":"([^"]+)"/g)].map((m) => m[1]);
    const mileage = facts.find((fact) => /км/.test(fact));
    items.push({
      title,
      year: Number(title.match(/\b(19|20)\d{2}\b/)?.[0]) || null,
      priceUsd: Number(match[1]),
      mileageKm: parseMileage(mileage),
      details: facts.filter((fact) => fact !== mileage).join(', '),
      url,
    });
  }
  return items;
}

/** schema.org AggregateOffer каталогу: мінімальна й максимальна ціна та кількість оголошень. */
function parseRange(html: string): MarketSnapshot['range'] {
  const match = html.match(/"priceCurrency":"USD","lowPrice":(\d+),"highPrice":(\d+),"offerCount":(\d+)/);
  return match ? { lowUsd: Number(match[1]), highUsd: Number(match[2]), count: Number(match[3]) } : null;
}

/** «227 тис. км» → 227000; «Без пробігу» → 0. */
function parseMileage(text: string | undefined): number | null {
  if (!text) return null;
  if (/без пробігу/i.test(text)) return 0;
  const value = Number(text.match(/[\d\s]+/)?.[0].replace(/\s/g, ''));
  if (!value) return null;
  return /тис/.test(text) ? value * 1000 : value;
}

function listingId(url: string) {
  return url.match(/_(\d+)\.html/)?.[1] ?? null;
}

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '',
};

/** Назва як у URL каталогу auto.ria: «Land Cruiser Prado» → land-cruiser-prado, «ВАЗ / Lada» → vaz-lada. */
function slug(name: string) {
  return [...name.toLowerCase()]
    .map((char) => CYRILLIC[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
