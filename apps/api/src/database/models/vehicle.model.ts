import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { Listing } from './listing.model';

@Table({ tableName: 'vehicles', underscored: true })
export class Vehicle extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.STRING(17), unique: true })
  declare vin: string | null;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare make: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare model: string;

  @Column(DataType.STRING(64))
  declare generation: string | null;

  @Column(DataType.STRING(64))
  declare engine: string | null;

  @Column(DataType.STRING(64))
  declare gearbox: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare year: number;

  @HasMany(() => Listing)
  declare listings?: Listing[];
}
