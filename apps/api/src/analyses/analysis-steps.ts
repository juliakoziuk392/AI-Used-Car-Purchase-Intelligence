import type {
  AnalysisReport,
  AnalysisStepKey,
  Model3dResult,
  ParsedListing,
  RiskSource,
} from '@carintel/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Analysis, Listing, RiskFlag } from '../database/models';
import { EMPTY_PARSED_LISTING, parseListingPage } from '../listings/listing-parser';
import { ListingsService } from '../listings/listings.service';
import { CarAnalystService } from './car-analyst.service';
import { Model3dService } from './model3d.service';

export interface StepContext {
  analysis: Analysis;
  listing: Listing;
  parsed?: ParsedListing;
  report?: AnalysisReport;
  model3d?: Model3dResult;
}

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

const RISK_SOURCE: Record<AnalysisReport['findings'][number]['source'], RiskSource> = {
  description: 'llm',
  photos: 'vision',
  model_knowledge: 'rag',
  price: 'market',
};

@Injectable()
export class AnalysisPipeline {
  constructor(
    private readonly analyst: CarAnalystService,
    private readonly model3d: Model3dService,
    private readonly listings: ListingsService,
    @InjectModel(RiskFlag) private readonly riskFlags: typeof RiskFlag,
  ) {}

  run(step: AnalysisStepKey, context: StepContext): Promise<void> {
    switch (step) {
      case 'listing':
        return this.loadListing(context);
      case 'vin':
        return this.checkVin(context);
      case 'ai':
        return this.runAi(context);
      case 'model3d':
        return this.buildModel(context);
      case 'report':
        return this.saveReport(context);
    }
  }

  private async loadListing(context: StepContext) {
    const { listing } = context;
    // Перечитуємо сторінку: оголошення могли оновити. Не вдалося — беремо збережене при створенні.
    const saved = { ...EMPTY_PARSED_LISTING, ...(listing.rawData as Partial<ParsedListing>) };
    context.parsed = await parseListingPage(listing.url).catch(() => saved);
    await listing.update({
      rawData: context.parsed,
      mileage: listing.mileage ?? context.parsed.mileageKm,
    });
  }

  private async checkVin(context: StepContext) {
    const vin = context.parsed?.vin ?? context.listing.vehicle?.vin;
    if (vin && !VIN_PATTERN.test(vin.toUpperCase())) {
      context.parsed = { ...context.parsed!, vin: null };
    }
  }

  /** Невдача 3D не зриває аналіз: звіт покаже стандартну модель у кольорі авто. */
  private async buildModel(context: StepContext) {
    context.model3d = await this.model3d.generate(context.analysis.id, context.parsed!, context.report);
  }

  private async runAi(context: StepContext) {
    context.report = await this.analyst.analyze(context.listing, context.parsed!);
  }

  private async saveReport(context: StepContext) {
    const { analysis, listing, report, parsed } = context;
    if (!report) throw new Error('Звіт не сформовано');

    // AI дістав характеристики з оголошення — доповнюємо ними дані авто.
    await this.listings.applyVehicle(listing, { ...report.vehicle, vin: parsed?.vin });
    if (listing.mileage === null && report.vehicle.mileageKm !== null) {
      await listing.update({ mileage: report.vehicle.mileageKm });
    }

    await this.riskFlags.destroy({ where: { analysisId: analysis.id } });
    await this.riskFlags.bulkCreate(
      report.findings.map((finding) => ({
        analysisId: analysis.id,
        severity: finding.severity,
        category: finding.zone,
        evidence: `${finding.title}: ${finding.evidence}`,
        source: RISK_SOURCE[finding.source],
      })),
    );
    await analysis.update({ score: report.riskScore, result: { report, model3d: context.model3d } });
  }
}
