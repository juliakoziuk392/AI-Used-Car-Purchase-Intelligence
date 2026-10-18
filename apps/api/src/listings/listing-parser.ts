import type { ParsedListing } from '@carintel/shared';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
/** Зберігаємо всі фото оголошення (на auto.ria їх буває до ~60). Скільки з них іде в LLM — вирішує аналітик. */
const MAX_PHOTOS = 80;
const MAX_DESCRIPTION_CHARS = 8000;

type Json = Record<string, unknown>;

/**
 * Дістає дані оголошення зі сторінки:
 * - schema.org Vehicle у JSON-LD — опис, VIN, пробіг, марка/модель;
 * - стан сторінки auto.ria (`window.__PINIA__`) — усі фото й таблиця характеристик/перевірок;
 * - og:title — ціна.
 */
export async function parseListingPage(url: string): Promise<ParsedListing> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'uk,ru;q=0.8,en;q=0.5' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Сторінка оголошення недоступна (HTTP ${response.status})`);
  return parseListingHtml(await response.text());
}

export const EMPTY_PARSED_LISTING: ParsedListing = {
  title: null,
  make: null,
  model: null,
  description: null,
  priceUsd: null,
  mileageKm: null,
  vin: null,
  year: null,
  photos: [],
  specs: {},
};

export function parseListingHtml(html: string): ParsedListing {
  const vehicles = extractJsonLd(html).filter((item) => item['@type'] === 'Vehicle');
  const vehicle: Json = Object.assign({}, ...vehicles);
  const pageState = extractPageState(html);

  const ogTitle = metaContent(html, 'og:title');
  const engine = vehicle.vehicleEngine as Json | undefined;
  const specs: Record<string, string> = {};
  if (typeof engine?.fuelType === 'string') specs['Пальне'] = engine.fuelType;
  if (typeof vehicle.vehicleTransmission === 'string') specs['КПП'] = vehicle.vehicleTransmission;
  if (typeof vehicle.color === 'string') specs['Колір'] = vehicle.color;
  if (pageState) Object.assign(specs, extractSpecs(pageState));

  const description = typeof vehicle.description === 'string' ? vehicle.description : metaContent(html, 'og:description');
  const brand = vehicle.brand as Json | string | undefined;

  const pagePhotos = pageState ? extractStatePhotos(pageState) : [];
  const photos = pagePhotos.length ? pagePhotos : extractLdPhotos(vehicles, metaContent(html, 'og:image'));

  return {
    title: typeof vehicle.name === 'string' ? vehicle.name : ogTitle,
    cover: metaContent(html, 'og:image'),
    make: typeof brand === 'string' ? brand : typeof brand?.name === 'string' ? brand.name : null,
    model: typeof vehicle.model === 'string' ? vehicle.model : null,
    description: description ? description.slice(0, MAX_DESCRIPTION_CHARS) : null,
    priceUsd: extractPrice(vehicle, ogTitle),
    mileageKm: numberOrNull((vehicle.mileageFromOdometer as Json | undefined)?.value),
    vin: typeof vehicle.vehicleIdentificationNumber === 'string' ? vehicle.vehicleIdentificationNumber : null,
    year: numberOrNull(vehicle.productionDate ?? vehicle.vehicleModelDate),
    photos: photos.slice(0, MAX_PHOTOS),
    specs,
  };
}

function extractJsonLd(html: string): Json[] {
  const blocks = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  const items: Json[] = [];
  for (const [, json] of blocks) {
    try {
      const parsed: unknown = JSON.parse(json);
      items.push(...(Array.isArray(parsed) ? parsed : [parsed]).filter(isObject));
    } catch {
      // Битий JSON-LD на сторінці — просто пропускаємо блок.
    }
  }
  return items;
}

/** Стан Vue-сторінки auto.ria: `window.__PINIA__ = {...};`. Шукаємо кінець об'єкта за балансом дужок. */
function extractPageState(html: string): Json | null {
  const marker = 'window.__PINIA__ = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start + marker.length; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const state: unknown = JSON.parse(html.slice(start + marker.length, i + 1));
        return isObject(state) ? state : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Галерея — найбільший масив елементів `{ type: 'Image', formats: {...} }` у стані сторінки. */
function extractStatePhotos(state: Json): string[] {
  let gallery: Json[] = [];
  walk(state, (node) => {
    if (Array.isArray(node) && node.length > gallery.length && node.every((item) => isObject(item) && item.type === 'Image')) {
      gallery = node as Json[];
    }
  });

  const seen = new Set<string>();
  const photos: string[] = [];
  for (const image of gallery) {
    const formats = (image.formats ?? {}) as Json;
    const url = [formats.large, formats.fullHD, image.src].find((value) => typeof value === 'string') as string | undefined;
    const id = String(image.id ?? url);
    if (url && !seen.has(id)) {
      seen.add(id);
      photos.push(url);
    }
  }
  return photos;
}

/**
 * Характеристики й результати перевірок auto.ria лежать у стані як пари текстових блоків:
 * підпис (typography: footnote) і одне чи кілька значень (typography: body) після нього.
 */
function extractSpecs(state: Json): Record<string, string> {
  const specs: Record<string, string[]> = {};
  let label: string | null = null;

  walk(state, (node) => {
    if (!isObject(node) || typeof node.id !== 'string' || !/^(desc|verifyings)/.test(node.id)) return;
    if (!Array.isArray(node.elements)) return;
    for (const element of node.elements) {
      if (!isObject(element) || element.type !== 'Text' || typeof element.content !== 'string') continue;
      const text = element.content.trim();
      // Підписи кнопок у блоках перевірок — не дані про авто.
      if (!text || /^Замовити|^Перевірити|^Детальніше/.test(text)) continue;
      if (element.typography === 'footnote') {
        label = text;
      } else if (label && element.typography === 'body') {
        const values = (specs[label] ??= []);
        if (!values.includes(text)) values.push(text);
      }
    }
  });

  return Object.fromEntries(Object.entries(specs).map(([key, values]) => [key, values.join('; ')]));
}

function walk(node: unknown, visit: (node: unknown) => void) {
  visit(node);
  if (Array.isArray(node)) for (const item of node) walk(item, visit);
  else if (isObject(node)) for (const value of Object.values(node)) walk(value, visit);
}

function extractPrice(vehicle: Json, ogTitle: string | null): number | null {
  const offers = vehicle.offers as Json | undefined;
  if (offers?.priceCurrency === 'USD') return numberOrNull(offers.price);
  const match = ogTitle?.match(/ціна\s+([\d\s]+)\s*\$/i);
  return match ? numberOrNull(match[1].replace(/\s/g, '')) : null;
}

/** Запасний варіант для сторінок без стану: фото з JSON-LD у великому розмірі (__<id>hd.webp). */
function extractLdPhotos(vehicles: Json[], ogImage: string | null): string[] {
  const urls = vehicles.flatMap((vehicle) => {
    const images = Array.isArray(vehicle.image) ? vehicle.image : [vehicle.image];
    return images.map((image) => (isObject(image) ? image.contentUrl ?? image.image : image));
  });
  if (ogImage) urls.unshift(ogImage);

  const byId = new Map<string, string>();
  for (const url of urls) {
    if (typeof url !== 'string' || !url.startsWith('https://')) continue;
    const ria = url.match(/^(https:\/\/cdn\d\.riastatic\.com\/photosnew\/auto\/photo\/[^/]+__)(\d+)[a-z]+\.(webp|jpg)$/);
    if (ria) {
      if (!byId.has(ria[2])) byId.set(ria[2], `${ria[1]}${ria[2]}hd.webp`);
    } else if (!url.includes('image-filter')) {
      byId.set(url, url);
    }
  }
  return [...byId.values()];
}

function metaContent(html: string, property: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function numberOrNull(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
