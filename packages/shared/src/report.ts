import type { RiskSeverity } from './enums';

/** Зони авто, до яких LLM прив'язує дефекти. Фронт малює для них точки на силуеті. */
export const CAR_ZONES = [
  'front',
  'engine',
  'electrics',
  'interior',
  'body',
  'rear',
  'front_wheel',
  'rear_wheel',
  'transmission',
  'underbody',
  'documents',
] as const;
export type CarZone = (typeof CAR_ZONES)[number];

export const CAR_ZONE_LABELS: Record<CarZone, string> = {
  front: 'Передня частина',
  engine: 'Двигун',
  electrics: 'Електрика',
  interior: 'Салон',
  body: 'Кузов',
  rear: 'Задня частина',
  front_wheel: 'Передня підвіска',
  rear_wheel: 'Задня підвіска',
  transmission: 'Трансмісія',
  underbody: 'Днище',
  documents: 'Документи та історія',
};

export const FINDING_SOURCES = ['description', 'photos', 'model_knowledge', 'price'] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

export const VERDICTS = ['buy', 'negotiate', 'avoid'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface ReportFinding {
  zone: CarZone;
  severity: RiskSeverity;
  title: string;
  detail: string;
  /** Цитата з опису, номер фото або джерело знань. */
  evidence: string;
  source: FindingSource;
  repairCostMinUsd: number | null;
  repairCostMaxUsd: number | null;
  /** Готова фраза для торгу з продавцем. */
  negotiation: string;
}

export const PRICE_VERDICTS = ['fair', 'overpriced', 'underpriced'] as const;
export type PriceVerdict = (typeof PRICE_VERDICTS)[number];

export interface PriceAssessment {
  /** Ціна з оголошення в USD; null — якщо продавець її не вказав. */
  listedPriceUsd: number | null;
  verdict: PriceVerdict;
  /** Реальна ринкова ціна цього авто з урахуванням знахідок. */
  marketPriceUsd: number;
  fairMinUsd: number;
  fairMaxUsd: number;
  suggestedOfferUsd: number;
  /** Одне речення: чи виправдана ціна. */
  headline: string;
  /** Аргументи «чому так»: що підвищує й що знижує ціну. */
  arguments: string[];
  /** Схожі оголошення, які AI знайшов у мережі й на які спирав ринкову ціну. */
  comparables?: MarketComparable[];
}

export interface MarketComparable {
  title: string;
  priceUsd: number;
  url: string;
}

export const BODY_TYPES = [
  'sedan',
  'hatchback',
  'wagon',
  'liftback',
  'coupe',
  'convertible',
  'crossover',
  'suv',
  'minivan',
  'van',
  'pickup',
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

/** Ракурс фото: AI класифікує кожне фото оголошення. */
export const PHOTO_VIEWS = [
  'front',
  'front_left',
  'left',
  'rear_left',
  'rear',
  'rear_right',
  'right',
  'front_right',
  'interior',
  'engine',
  'wheel',
  'underbody',
  'documents',
  'other',
] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];

export interface PhotoInfo {
  /** Номер фото в оголошенні, з 1. */
  photo: number;
  view: PhotoView;
}

/** Характеристики авто, які AI дістав з оголошення. */
export interface ExtractedVehicle {
  bodyType: BodyType | null;
  /** Колір кузова з фото, напр. "#5b6168". */
  colorHex: string | null;
  make: string | null;
  model: string | null;
  generation: string | null;
  year: number | null;
  engine: string | null;
  gearbox: string | null;
  mileageKm: number | null;
}

export interface AnalysisReport {
  /** true — дані згенеровані без LLM (немає ключа), лише для демонстрації UI. */
  demo: boolean;
  vehicle: ExtractedVehicle;
  /** 0 — ризиків немає, 100 — не купувати. */
  riskScore: number;
  verdict: Verdict;
  summary: string;
  strengths: string[];
  findings: ReportFinding[];
  price: PriceAssessment;
  questionsForSeller: string[];
  /** Ракурси проаналізованих фото — для фото-360 і вибору кадру під 3D. */
  photoViews: PhotoInfo[];
  /** Номер найкращого фото кузова на 3/4 (для генерації 3D-моделі). */
  heroPhoto: number | null;
  /** Скільки фото з оголошення бачив AI. */
  photosAnalyzed: number;
}

/** Те, що парсер дістав зі сторінки оголошення. Зберігається в listings.raw_data. */
export interface ParsedListing {
  title: string | null;
  /** Обкладинка оголошення (og:image) — зазвичай найкраще фото кузова. */
  cover?: string | null;
  make: string | null;
  model: string | null;
  description: string | null;
  priceUsd: number | null;
  mileageKm: number | null;
  vin: string | null;
  year: number | null;
  photos: string[];
  specs: Record<string, string>;
}
