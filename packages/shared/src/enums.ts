export const LISTING_SOURCES = ['autoria', 'olx', 'other'] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

export const ANALYSIS_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const TERMINAL_ANALYSIS_STATUSES: readonly AnalysisStatus[] = ['done', 'failed'];

/** Кроки пайплайна аналізу в порядку виконання. */
export const ANALYSIS_STEPS = [
  { key: 'listing', label: 'Завантажуємо оголошення', hint: 'Ціна, пробіг, опис і фото зі сторінки' },
  { key: 'vin', label: 'Перевіряємо VIN', hint: 'Формат і відповідність даним оголошення' },
  { key: 'ai', label: 'AI аналізує опис і фото', hint: 'Дефекти по вузлах, типові проблеми моделі, ціна' },
  { key: 'model3d', label: 'Будуємо 3D-модель цього авто', hint: 'З реальних фото оголошення' },
  { key: 'report', label: 'Формуємо звіт', hint: 'Оцінка ризику й аргументи для торгу' },
] as const;
export type AnalysisStepKey = (typeof ANALYSIS_STEPS)[number]['key'];
export const ANALYSIS_STEP_KEYS = ANALYSIS_STEPS.map((step) => step.key) as AnalysisStepKey[];

export const RISK_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_SOURCES = ['llm', 'vision', 'rag', 'market'] as const;
export type RiskSource = (typeof RISK_SOURCES)[number];

export function detectListingSource(url: string): ListingSource {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host === 'auto.ria.com' || host.endsWith('.auto.ria.com')) return 'autoria';
  if (host.startsWith('olx.')) return 'olx';
  return 'other';
}
