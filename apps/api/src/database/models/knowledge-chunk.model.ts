import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'knowledge_chunks', underscored: true })
export class KnowledgeChunk extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare text: string;

  // Sequelize не знає типу pgvector, тому передаємо його як сирий SQL-тип.
  // Postgres повертає значення рядком виду "[0.1,0.2,...]".
  @Column({ type: 'vector(1536)' })
  declare embedding: string | null;

  @Column(DataType.STRING(64))
  declare make: string | null;

  @Column(DataType.STRING(64))
  declare model: string | null;

  @Column(DataType.STRING(64))
  declare engine: string | null;

  @Column(DataType.TEXT)
  declare source: string | null;
}
