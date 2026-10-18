import { TERMINAL_ANALYSIS_STATUSES, type AnalysisResult, type ParsedListing } from '@carintel/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Queue } from 'bullmq';
import { concatMap, filter, map, Observable, startWith, takeWhile } from 'rxjs';
import { Analysis, Listing, RiskFlag } from '../database/models';
import { EMPTY_PARSED_LISTING } from '../listings/listing-parser';
import { ListingsService } from '../listings/listings.service';
import { AnalysisEventsListener } from './analysis-events.listener';
import { ANALYSIS_QUEUE, type AnalysisJobData } from './analysis.queue';
import { Model3dService } from './model3d.service';

@Injectable()
export class AnalysesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalysesService.name);

  constructor(
    @InjectModel(Analysis) private readonly analyses: typeof Analysis,
    @InjectQueue(ANALYSIS_QUEUE) private readonly queue: Queue<AnalysisJobData>,
    private readonly listings: ListingsService,
    private readonly events: AnalysisEventsListener,
    private readonly model3d: Model3dService,
  ) {}

  /** Аналізи, створені до появи черги або втрачені при падінні, ставимо в чергу повторно. */
  async onApplicationBootstrap() {
    const pending = await this.analyses.findAll({ where: { status: ['queued', 'running'] } });
    for (const analysis of pending) await this.enqueue(analysis.id);
    if (pending.length) this.logger.log(`Re-enqueued ${pending.length} pending analyses`);
  }

  async create(userId: string, listingId: string) {
    await this.listings.findOne(userId, listingId);
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

  /** Повторна генерація 3D без повторного AI-аналізу — напр. коли під час аналізу скінчилась квота GPU. */
  async regenerateModel(userId: string, id: string) {
    const analysis = await this.findOne(userId, id);
    const listing = await Listing.findByPk(analysis.listingId);
    const result = (analysis.result ?? {}) as AnalysisResult;
    const parsed = { ...EMPTY_PARSED_LISTING, ...(listing?.rawData as Partial<ParsedListing>) };
    const model3d = await this.model3d.generate(id, parsed, result.report);
    await analysis.update({ result: { ...result, model3d } });
    return analysis;
  }

  /** Поточний стан аналізу, а далі — новий стан на кожну подію черги, доки аналіз не завершиться. */
  stream(userId: string, id: string): Observable<{ data: Analysis }> {
    return this.events.changed$.pipe(
      filter((jobId) => jobId === id),
      startWith(id),
      concatMap(() => this.findOne(userId, id)),
      takeWhile((analysis) => !TERMINAL_ANALYSIS_STATUSES.includes(analysis.status), true),
      map((analysis) => ({ data: analysis })),
    );
  }

  private enqueue(analysisId: string) {
    // jobId = analysisId: повторне додавання тієї самої задачі BullMQ ігнорує.
    return this.queue.add(
      'analyze',
      { analysisId },
      { jobId: analysisId, removeOnComplete: 1000, removeOnFail: 1000 },
    );
  }
}
