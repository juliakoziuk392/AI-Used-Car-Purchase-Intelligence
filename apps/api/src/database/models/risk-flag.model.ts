import {
  RISK_SEVERITIES,
  RISK_SOURCES,
  type RiskSeverity,
  type RiskSource,
} from '@carintel/shared';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Analysis } from './analysis.model';

@Table({ tableName: 'risk_flags', underscored: true })
export class RiskFlag extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Analysis)
  @Column({ type: DataType.UUID, allowNull: false })
  declare analysisId: string;

  @BelongsTo(() => Analysis)
  declare analysis?: Analysis;

  @Column({ type: DataType.ENUM(...RISK_SEVERITIES), allowNull: false })
  declare severity: RiskSeverity;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare category: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare evidence: string;

  @Column({ type: DataType.ENUM(...RISK_SOURCES), allowNull: false })
  declare source: RiskSource;
}
