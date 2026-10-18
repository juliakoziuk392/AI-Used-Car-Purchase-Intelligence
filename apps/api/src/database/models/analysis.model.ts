import { ANALYSIS_STATUSES, type AnalysisStatus, type AnalysisStepKey } from '@carintel/shared';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Listing } from './listing.model';
import { RiskFlag } from './risk-flag.model';

@Table({ tableName: 'analyses', underscored: true })
export class Analysis extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Listing)
  @Column({ type: DataType.UUID, allowNull: false })
  declare listingId: string;

  @BelongsTo(() => Listing)
  declare listing?: Listing;

  @Column({ type: DataType.ENUM(...ANALYSIS_STATUSES), allowNull: false, defaultValue: 'queued' })
  declare status: AnalysisStatus;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare progress: number;

  @Column(DataType.STRING(32))
  declare currentStep: AnalysisStepKey | null;

  @Column(DataType.INTEGER)
  declare score: number | null;

  @Column(DataType.JSONB)
  declare result: Record<string, unknown> | null;

  @HasMany(() => RiskFlag)
  declare riskFlags?: RiskFlag[];
}
