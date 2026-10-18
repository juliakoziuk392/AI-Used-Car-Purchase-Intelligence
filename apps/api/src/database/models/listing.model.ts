import { LISTING_SOURCES, type ListingSource } from '@carintel/shared';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Analysis } from './analysis.model';
import { ListingPhoto } from './listing-photo.model';
import { User } from './user.model';
import { Vehicle } from './vehicle.model';

@Table({ tableName: 'listings', underscored: true })
export class Listing extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @ForeignKey(() => Vehicle)
  @Column(DataType.UUID)
  declare vehicleId: string | null;

  @BelongsTo(() => Vehicle)
  declare vehicle?: Vehicle | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare url: string;

  @Column({ type: DataType.ENUM(...LISTING_SOURCES), allowNull: false })
  declare source: ListingSource;

  /** Ціна з оголошення в USD; null — якщо на сторінці її не знайшли. */
  @Column(DataType.INTEGER)
  declare price: number | null;

  @Column(DataType.INTEGER)
  declare mileage: number | null;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare rawData: Record<string, unknown>;

  @HasMany(() => ListingPhoto)
  declare photos?: ListingPhoto[];

  @HasMany(() => Analysis)
  declare analyses?: Analysis[];
}
