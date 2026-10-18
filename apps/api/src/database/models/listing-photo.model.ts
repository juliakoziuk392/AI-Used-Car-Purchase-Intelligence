import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Listing } from './listing.model';

@Table({ tableName: 'listing_photos', underscored: true })
export class ListingPhoto extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Listing)
  @Column({ type: DataType.UUID, allowNull: false })
  declare listingId: string;

  @BelongsTo(() => Listing)
  declare listing?: Listing;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare s3Key: string;

  @Column(DataType.STRING(32))
  declare angle: string | null;

  @Column(DataType.JSONB)
  declare findings: Record<string, unknown> | null;
}
