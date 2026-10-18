import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'market_snapshots', underscored: true, timestamps: false })
export class MarketSnapshot extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  /** Нормалізований ключ авто, напр. "volkswagen|passat|b8|2.0 tdi|dsg|2017". */
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare vehicleKey: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare p25: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare p50: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare p75: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sampleSize: number;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare capturedAt: Date;
}
