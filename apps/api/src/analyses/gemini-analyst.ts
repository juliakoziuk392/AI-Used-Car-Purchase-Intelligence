import type { ParsedListing } from '@carintel/shared';
import { ApiError, FinishReason, GoogleGenAI, type Part } from '@google/genai';
import { z } from 'zod/v4';
import type { Listing } from '../database/models';
import type { MarketSnapshot } from '../listings/market-comparables';
import { describeListing, ReportSchema, SYSTEM_PROMPT, type ListingPhoto } from './analyst-prompt';
import type { LlmAnalysis, LlmAnalyst } from './llm-analyst';

/** Новим акаунтам доступні моделі 3.x; 2.5 Google вже не видає. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
/** Gemini приймає фото лише байтами в запиті; ліміт запиту ~20 МБ — лишаємо запас на текст. */
const MAX_PHOTO_BYTES = 14 * 1024 * 1024;

/** Схема звіту для Gemini — той самий Zod, що й для Claude, у вигляді JSON Schema. */
const REPORT_JSON_SCHEMA = (() => {
  const { $schema: _, ...schema } = z.toJSONSchema(ReportSchema);
  return schema;
})();

/**
 * Gemini (Google): аналіз оголошення й фото зі строгою JSON-схемою.
 * Ринкові ціни приходять з каталогу auto.ria — пошук Google на безкоштовному ключі недоступний.
 */
export class GeminiAnalyst implements LlmAnalyst {
  readonly name: string;
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.name = `Gemini (${model})`;
  }

  async analyze(
    listing: Listing,
    parsed: ParsedListing,
    photos: ListingPhoto[],
    market: MarketSnapshot | null,
  ): Promise<LlmAnalysis> {
    try {
      const images = await downloadPhotos(photos);
      const parts: Part[] = [
        { text: describeListing(listing, parsed, market) },
        ...images.flatMap(({ number, mimeType, data }): Part[] => [
          { text: `Фото ${number}:` },
          { inlineData: { mimeType, data } },
        ]),
      ];

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: REPORT_JSON_SCHEMA,
          maxOutputTokens: 32000,
        },
      });

      const finish = response.candidates?.[0]?.finishReason;
      if (finish === FinishReason.MAX_TOKENS) throw new Error('Відповідь моделі обрізана (max tokens)');
      if (finish === FinishReason.SAFETY || response.promptFeedback?.blockReason) {
        throw new Error('Модель відмовилась аналізувати це оголошення');
      }
      if (!response.text) throw new Error('Модель повернула порожню відповідь');

      const report = ReportSchema.safeParse(JSON.parse(response.text));
      if (!report.success) throw new Error('Модель повернула відповідь не за схемою');
      return { report: report.data, photosAnalyzed: images.length };
    } catch (error) {
      throw friendlyError(error);
    }
  }

}

interface DownloadedPhoto {
  number: number;
  mimeType: string;
  data: string;
}

/** Фото оголошення → base64; пропускаємо ті, що не завантажились, і зупиняємось на ліміті розміру. */
async function downloadPhotos(photos: ListingPhoto[]): Promise<DownloadedPhoto[]> {
  const results = await Promise.all(
    photos.map(async ({ url, number }) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) return null;
        const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
        if (!mimeType.startsWith('image/')) return null;
        return { number, mimeType, bytes: Buffer.from(await response.arrayBuffer()) };
      } catch {
        return null;
      }
    }),
  );

  const selected: DownloadedPhoto[] = [];
  let total = 0;
  for (const photo of results) {
    if (!photo) continue;
    total += photo.bytes.length;
    if (total > MAX_PHOTO_BYTES) break;
    selected.push({ number: photo.number, mimeType: photo.mimeType, data: photo.bytes.toString('base64') });
  }
  return selected;
}

/** Помилки API Gemini → зрозуміле повідомлення в UI. */
function friendlyError(error: unknown): Error {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return new Error('Вичерпано безкоштовний ліміт запитів Gemini. Спробуй за хвилину або завтра.');
    }
    if (error.status === 400 && /api key/i.test(error.message)) {
      return new Error('Невірний GEMINI_API_KEY — перевір ключ у .env.');
    }
    if (error.status === 403) return new Error('Gemini API недоступний для цього ключа або регіону.');
    return new Error(`Помилка Gemini API (${error.status}): ${error.message}`);
  }
  // fetch кидає «fetch failed», а справжня причина (DNS, TLS, обрив з'єднання) — у cause.
  if (error instanceof Error && error.cause) {
    const cause = error.cause as { code?: string; message?: string };
    return new Error(`Не вдалося з'єднатися з Gemini API: ${cause.code ?? cause.message ?? String(cause)}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}
