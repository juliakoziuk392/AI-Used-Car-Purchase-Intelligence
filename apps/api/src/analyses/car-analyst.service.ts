import type { AnalysisReport, ParsedListing } from '@carintel/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Listing } from '../database/models';
import { findMarketComparables, type MarketSnapshot } from '../listings/market-comparables';
import { finalizeReport, selectPhotos } from './analyst-prompt';
import { ClaudeAnalyst } from './claude-analyst';
import { buildDemoReport } from './demo-report';
import { DEFAULT_GEMINI_MODEL, GeminiAnalyst } from './gemini-analyst';
import { LLM_PROVIDERS, type LlmAnalyst, type LlmProvider } from './llm-analyst';

/** Скільки фото оголошення надсилати в модель. Змінюється через LLM_MAX_PHOTOS. */
const DEFAULT_MAX_PHOTOS = 40;
const DEMO_DELAY_MS = 4000;

/**
 * AI-аналіз оголошення. Провайдер — LLM_PROVIDER у .env (gemini | claude);
 * без нього — той, для якого задано ключ. Без ключа звіти будуються в демо-режимі.
 */
@Injectable()
export class CarAnalystService {
  private readonly logger = new Logger(CarAnalystService.name);
  private readonly analyst: LlmAnalyst | null;
  private readonly maxPhotos: number;

  constructor(config: ConfigService) {
    this.maxPhotos = Number(config.get('LLM_MAX_PHOTOS', DEFAULT_MAX_PHOTOS));
    this.analyst = createAnalyst(config);
    if (this.analyst) this.logger.log(`AI-аналіз: ${this.analyst.name}`);
    else this.logger.warn('Ключ LLM не задано (GEMINI_API_KEY або LLM_API_KEY) — звіти будуються в демо-режимі');
  }

  async analyze(listing: Listing, parsed: ParsedListing): Promise<AnalysisReport> {
    if (!this.analyst) {
      // Без LLM крок миттєвий — невелика пауза, щоб у UI було видно етап аналізу.
      await new Promise((resolve) => setTimeout(resolve, DEMO_DELAY_MS));
      return buildDemoReport(listing, parsed);
    }

    const photos = selectPhotos(parsed.photos, this.maxPhotos);
    const market = await this.findMarket(listing, parsed);
    const { report, photosAnalyzed } = await this.analyst.analyze(listing, parsed, photos, market);
    return finalizeReport(report, listing, parsed, photosAnalyzed, market);
  }

  /** Живі ціни схожих авто з auto.ria — основа ринкової оцінки для будь-якого провайдера. */
  private async findMarket(listing: Listing, parsed: ParsedListing): Promise<MarketSnapshot | null> {
    const make = listing.vehicle?.make ?? parsed.make;
    const model = listing.vehicle?.model ?? parsed.model;
    if (!make || !model) return null;
    const market = await findMarketComparables({
      make,
      model,
      year: listing.vehicle?.year ?? parsed.year,
      mileageKm: parsed.mileageKm ?? listing.mileage,
      excludeUrl: listing.url,
    }).catch(() => null);
    this.logger.log(`Ринок ${make} ${model}: ${market?.comparables.length ?? 0} схожих оголошень`);
    return market;
  }
}

function createAnalyst(config: ConfigService): LlmAnalyst | null {
  const geminiKey = config.get<string>('GEMINI_API_KEY');
  const claudeKey = config.get<string>('LLM_API_KEY') || config.get<string>('ANTHROPIC_API_KEY');
  const requested = config.get<string>('LLM_PROVIDER')?.toLowerCase();
  const provider: LlmProvider | undefined = LLM_PROVIDERS.find((p) => p === requested) ?? (geminiKey ? 'gemini' : claudeKey ? 'claude' : undefined);

  if (provider === 'gemini' && geminiKey) {
    return new GeminiAnalyst(geminiKey, config.get<string>('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL);
  }
  if (provider === 'claude' && claudeKey) return new ClaudeAnalyst(claudeKey);
  return null;
}
