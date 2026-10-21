import {
  ANALYSIS_STEPS,
  type AnalysisResult,
  type Model3dResult,
  type ParsedListing,
} from '@carintel/shared';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Job } from 'bullmq';
import { Analysis, Listing, Vehicle } from '../database/models';
import { EMPTY_PARSED_LISTING } from '../listings/listing-parser';
import { AnalysisPipeline, type StepContext } from './analysis-steps';
import {
  ANALYSIS_CONCURRENCY,
  ANALYSIS_QUEUE,
  MODEL3D_JOB,
  type AnalysisJobData,
} from './analysis.queue';
import { Model3dService } from './model3d.service';

@Processor(ANALYSIS_QUEUE, { concurrency: ANALYSIS_CONCURRENCY })
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    @InjectModel(Analysis) private readonly analyses: typeof Analysis,
    private readonly pipeline: AnalysisPipeline,
    private readonly model3d: Model3dService,
  ) {
    super();
  }

  process(job: Job<AnalysisJobData>): Promise<void> {
    return job.name === MODEL3D_JOB ? this.regenerateModel(job) : this.analyze(job);
  }

  private async analyze(job: Job<AnalysisJobData>): Promise<void> {
    const analysis = await this.analyses.findByPk(job.data.analysisId, {
      include: [{ model: Listing, include: [Vehicle] }],
    });
    if (!analysis?.listing) {
      this.logger.warn(`Analysis ${job.data.analysisId} not found, skipping`);
      return;
    }

    // Стан пишемо в БД до job.updateProgress: SSE-стрім перечитує аналіз з БД
    // на кожну подію черги, тож БД має бути актуальною на момент події.
    const context: StepContext = { analysis, listing: analysis.listing };
    try {
      for (const [index, step] of ANALYSIS_STEPS.entries()) {
        await analysis.update({
          status: 'running',
          currentStep: step.key,
          progress: Math.round((index / ANALYSIS_STEPS.length) * 100),
        });
        await job.updateProgress(analysis.progress);
        await this.pipeline.run(step.key, context);
      }

      await analysis.update({ status: 'done', currentStep: null, progress: 100 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // attemptsMade — кількість попередніх спроб, поточна до неї ще не входить.
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      this.logger.error(`Analysis ${analysis.id} failed${willRetry ? ', will retry' : ''}: ${message}`);
      // Поки є спроби, лишаємо аналіз у черзі: SSE-стрім не закривається, клієнт бачить повтор.
      await analysis.update(
        willRetry
          ? { status: 'queued', currentStep: null, progress: 0 }
          : { status: 'failed', result: { error: message } },
      );
      throw error;
    }
  }

  /** Повторна генерація лише 3D: звіт не чіпаємо, прогрес пишемо в result.model3d. */
  private async regenerateModel(job: Job<AnalysisJobData>): Promise<void> {
    const analysis = await this.analyses.findByPk(job.data.analysisId, { include: [Listing] });
    if (!analysis?.listing) {
      this.logger.warn(`Analysis ${job.data.analysisId} not found, skipping 3D`);
      return;
    }

    const result = (analysis.result ?? {}) as AnalysisResult;
    const parsed = { ...EMPTY_PARSED_LISTING, ...(analysis.listing.rawData as Partial<ParsedListing>) };
    const saveModel3d = (model3d: Model3dResult) => analysis.update({ result: { ...result, model3d } });
    const generating = result.model3d;

    let model3d: Model3dResult;
    try {
      model3d = await this.model3d.generate(analysis.id, parsed, result.report, async (progress, stage) => {
        await saveModel3d({ ...generating, status: 'generating', photos: generating?.photos ?? [], progress, stage });
        await job.updateProgress(progress);
      });
    } catch (error) {
      // generate() сам ловить помилки TRELLIS; сюди долітають лише збої БД чи Redis.
      model3d = { status: 'failed', photos: [], error: error instanceof Error ? error.message : String(error) };
    }
    await saveModel3d(model3d);
  }
}
