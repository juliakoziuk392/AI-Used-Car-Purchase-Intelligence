import type { ParsedListing } from '@carintel/shared';
import type { Listing } from '../database/models';
import type { MarketSnapshot } from '../listings/market-comparables';
import type { ListingPhoto, ReportOutput } from './analyst-prompt';

/** LLM-провайдер аналізу оголошення. Промпт і схема спільні — див. analyst-prompt.ts. */
export interface LlmAnalyst {
  /** Для логів: провайдер і модель. */
  readonly name: string;
  analyze(listing: Listing, parsed: ParsedListing, photos: ListingPhoto[], market: MarketSnapshot | null): Promise<LlmAnalysis>;
}

export interface LlmAnalysis {
  report: ReportOutput;
  /** Скільки фото модель реально побачила (частина могла не завантажитись). */
  photosAnalyzed: number;
}

export const LLM_PROVIDERS = ['gemini', 'claude'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];
