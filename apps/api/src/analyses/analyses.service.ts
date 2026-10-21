import { isAnalysisSettled, type AnalysisResult, type Model3dResult } from '@carintel/shared';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import type { Queue } from 'bullmq';
import { Op } from 'sequelize';
import { concatMap, filter, map, Observable, startWith, takeWhile } from 'rxjs';
import { Analysis, Listing, RiskFlag } from '../database/models';
import { ListingsService } from '../listings/listings.service';
import { AnalysisEventsListener } from './analysis-events.listener';
import {
  ANALYSIS_ATTEMPTS,
  ANALYSIS_QUEUE,
  ANALYZE_JOB,
  MODEL3D_JOB,
  model3dJobId,
  type AnalysisJobData,
} from './analysis.queue';

/** Генерація 3D триває 1–3 хв; «generating» довше за це — задача загубилась. */
const MODEL3D_STALE_MS = 15 * 60 * 1000;

const toSettledShape = (analysis: Analysis) => ({
  status: analysis.status,
  result: analysis.result as AnalysisResult | null,
});

@Injectable()
export class AnalysesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalysesService.name);

  constructor(
    @InjectModel(Analysis) private readonly analyses: typeof Analysis,
    @InjectQueue(ANALYSIS_QUEUE) private readonly queue: Queue<AnalysisJobData>,
    private readonly listings: ListingsService,
    private readonly events: AnalysisEventsListener,
    private readonly config: ConfigService,
  ) {}

  /** Аналізи, створені до появи черги або втрачені при падінні, ставимо в чергу повторно. */
  async onApplicationBootstrap() {
    const pending = await this.analyses.findAll({ where: { status: ['queued', 'running'] } });
    for (const analysis of pending) await this.enqueue(analysis.id);
    if (pending.length) this.logger.log(`Re-enqueued ${pending.length} pending analyses`);
  }

  async create(userId: string, listingId: string) {
    await this.listings.findOne(userId, listingId);
    await this.assertDailyLimit(userId);
    const analysis = await this.analyses.create({ listingId, status: 'queued', progress: 0 });
    await this.enqueue(analysis.id);
    return analysis;
  }

  async findOne(userId: string, id: string) {
    const analysis = await this.analyses.findOne({
      where: { id },
      include: [{ model: Listing, where: { userId }, attributes: [] }, RiskFlag],
    });
    if (!analysis) throw new NotFoundException('Analysis not found');
    return analysis;
  }

  /**
   * Повторна генерація 3D без повторного AI-аналізу — напр. коли під час аналізу скінчилась квота GPU.
   * Ставить задачу в чергу й одразу відповідає; прогрес приходить через SSE (`result.model3d`).
   */
  async regenerateModel(userId: string, id: string) {
    const analysis = await this.findOne(userId, id);
    if (analysis.status !== 'done') throw new ConflictException('3D можна згенерувати лише для завершеного аналізу');

    const result = (analysis.result ?? {}) as AnalysisResult;
    const current = result.model3d;
    const startedAt = current?.startedAt ? Date.parse(current.startedAt) : 0;
    // Задача могла загубитись (напр. очистили Redis) — після таймауту дозволяємо запустити знову.
    if (current?.status === 'generating' && Date.now() - startedAt < MODEL3D_STALE_MS) {
      throw new ConflictException('3D-модель уже генерується');
    }

    await analysis.update({
      result: {
        ...result,
        model3d: {
          status: 'generating',
          photos: current?.photos ?? [],
          progress: 0,
          stage: 'Чекаємо в черзі',
          startedAt: new Date().toISOString(),
        } satisfies Model3dResult,
      },
    });
    // Без повторів: generate() сам перетворює збій TRELLIS на status 'failed' з поясненням.
    await this.queue.add(
      MODEL3D_JOB,
      { analysisId: id },
      { jobId: model3dJobId(id), removeOnComplete: 1000, removeOnFail: 1000 },
    );
    return analysis;
  }

  /** Поточний стан аналізу, а далі — новий стан на кожну подію черги, доки аналіз і генерація 3D не завершаться. */
  stream(userId: string, id: string): Observable<{ data: Analysis }> {
    return this.events.changed$.pipe(
      filter((analysisId) => analysisId === id),
      startWith(id),
      concatMap(() => this.findOne(userId, id)),
      takeWhile((analysis) => !isAnalysisSettled(toSettledShape(analysis)), true),
      map((analysis) => ({ data: analysis })),
    );
  }

  /** Кожен аналіз витрачає квоту LLM і GPU, тож обмежуємо їх кількість на користувача за добу. */
  private async assertDailyLimit(userId: string) {
    const limit = this.config.get<number>('ANALYSES_DAILY_LIMIT', 20);
    const count = await this.analyses.count({
      where: { createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      include: [{ model: Listing, where: { userId }, attributes: [] }],
    });
    if (count >= limit) {
      throw new HttpException(
        `Вичерпано ліміт: ${limit} аналізів за добу. Спробуй пізніше.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private enqueue(analysisId: string) {
    // jobId = analysisId: повторне додавання тієї самої задачі BullMQ ігнорує.
    return this.queue.add(
      ANALYZE_JOB,
      { analysisId },
      {
        jobId: analysisId,
        // Збій LLM чи auto.ria часто тимчасовий — пробуємо ще раз через 30 с, потім через 60 с.
        attempts: ANALYSIS_ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }
}
