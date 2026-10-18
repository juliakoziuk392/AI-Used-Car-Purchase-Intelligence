import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { AnalysisEventsListener } from './analysis-events.listener';
import { AnalysisPipeline } from './analysis-steps';
import { CarAnalystService } from './car-analyst.service';
import { Model3dService } from './model3d.service';
import { AnalysisProcessor } from './analysis.processor';
import { ANALYSIS_QUEUE } from './analysis.queue';

@Module({
  imports: [ListingsModule, BullModule.registerQueue({ name: ANALYSIS_QUEUE })],
  controllers: [AnalysesController],
  providers: [
    AnalysesService,
    AnalysisProcessor,
    AnalysisEventsListener,
    AnalysisPipeline,
    CarAnalystService,
    Model3dService,
  ],
})
export class AnalysesModule {}
