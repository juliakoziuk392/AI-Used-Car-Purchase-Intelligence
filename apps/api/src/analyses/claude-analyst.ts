import type { ParsedListing } from '@carintel/shared';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Listing } from '../database/models';
import type { MarketSnapshot } from '../listings/market-comparables';
import { describeListing, ReportSchema, SYSTEM_PROMPT, type ListingPhoto } from './analyst-prompt';
import type { LlmAnalysis, LlmAnalyst } from './llm-analyst';

const MODEL = 'claude-opus-5-5';
/** Пошук схожих оголошень для ринкової ціни. */
const MARKET_DOMAINS = ['auto.ria.com', 'olx.ua', 'rst.ua'];
const MAX_SEARCHES = 5;
const MAX_CONTINUATIONS = 3;

/** Claude (Anthropic): фото за URL, структурована відповідь і вебпошук (на додачу до каталогу auto.ria) в одному запиті. */
export class ClaudeAnalyst implements LlmAnalyst {
  readonly name = `Claude (${MODEL})`;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyze(
    listing: Listing,
    parsed: ParsedListing,
    photos: ListingPhoto[],
    market: MarketSnapshot | null,
  ): Promise<LlmAnalysis> {
    // Кожне фото підписуємо його номером в оголошенні — модель посилається на них у знахідках.
    const images = photos.flatMap(({ url, number }): Anthropic.Beta.BetaContentBlockParam[] => [
      { type: 'text', text: `Фото ${number}:` },
      { type: 'image', source: { type: 'url', url } },
    ]);

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: [{ type: 'text', text: describeListing(listing, parsed, market) }, ...images] },
    ];
    const request = () =>
      this.client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        // Якщо модель відмовить, сервер сам перезапустить запит на резервній моделі.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(ReportSchema) },
        system: SYSTEM_PROMPT,
        // Живі оголошення для ринкової ціни — пошук виконується на серверах Anthropic.
        tools: [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: MAX_SEARCHES,
            allowed_domains: MARKET_DOMAINS,
            user_location: { type: 'approximate', country: 'UA' },
          },
        ],
        messages,
      });

    let response = await request();
    // Серверний цикл пошуку може стати на паузу — продовжуємо з того самого місця.
    for (let i = 0; response.stop_reason === 'pause_turn' && i < MAX_CONTINUATIONS; i++) {
      messages.push({ role: 'assistant', content: response.content });
      response = await request();
    }

    if (response.stop_reason === 'refusal') throw new Error('Модель відмовилась аналізувати це оголошення');
    if (response.stop_reason === 'max_tokens') throw new Error('Відповідь моделі обрізана (max_tokens)');
    if (!response.parsed_output) throw new Error('Модель повернула відповідь не за схемою');
    return { report: response.parsed_output, photosAnalyzed: photos.length };
  }
}
