import {
  Column,
  DataType,
  DefaultScope,
  HasMany,
  Model,
  Scopes,
  Table,
} from 'sequelize-typescript';
import { Listing } from './listing.model';

@DefaultScope(() => ({ attributes: { exclude: ['passwordHash'] } }))
@Scopes(() => ({ withPassword: { attributes: { include: ['passwordHash'] } } }))
@Table({ tableName: 'users', underscored: true })
export class User extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare passwordHash: string;

  @HasMany(() => Listing)
  declare listings?: Listing[];

  declare createdAt: Date;
  declare updatedAt: Date;
}
