import { ANALYSIS_STEPS } from '@carintel/shared';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Job } from 'bullmq';
import { Analysis, Listing, Vehicle } from '../database/models';
import { AnalysisPipeline, type StepContext } from './analysis-steps';
import { ANALYSIS_QUEUE, type AnalysisJobData } from './analysis.queue';

@Processor(ANALYSIS_QUEUE)
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    @InjectModel(Analysis) private readonly analyses: typeof Analysis,
    private readonly pipeline: AnalysisPipeline,
  ) {
    super();
  }

  async process(job: Job<AnalysisJobData>): Promise<void> {
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
      this.logger.error(`Analysis ${analysis.id} failed: ${message}`);
      await analysis.update({ status: 'failed', result: { error: message } });
      throw error;
    }
  }
}
