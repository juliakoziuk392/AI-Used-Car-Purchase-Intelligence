'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
});

const id = (Sequelize) => ({
  type: Sequelize.UUID,
  primaryKey: true,
  defaultValue: Sequelize.literal('gen_random_uuid()'),
});

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector');

    await queryInterface.createTable('users', {
      id: id(Sequelize),
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('vehicles', {
      id: id(Sequelize),
      vin: { type: Sequelize.STRING(17), allowNull: true, unique: true },
      make: { type: Sequelize.STRING(64), allowNull: false },
      model: { type: Sequelize.STRING(64), allowNull: false },
      generation: { type: Sequelize.STRING(64) },
      engine: { type: Sequelize.STRING(64) },
      gearbox: { type: Sequelize.STRING(64) },
      year: { type: Sequelize.INTEGER, allowNull: false },
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('listings', {
      id: id(Sequelize),
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      vehicle_id: {
        type: Sequelize.UUID,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'SET NULL',
      },
      url: { type: Sequelize.TEXT, allowNull: false },
      source: { type: Sequelize.ENUM('autoria', 'olx', 'other'), allowNull: false },
      price: { type: Sequelize.INTEGER, allowNull: false },
      mileage: { type: Sequelize.INTEGER, allowNull: false },
      raw_data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('listings', ['user_id']);

    await queryInterface.createTable('listing_photos', {
      id: id(Sequelize),
      listing_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'listings', key: 'id' },
        onDelete: 'CASCADE',
      },
      s3_key: { type: Sequelize.TEXT, allowNull: false },
      angle: { type: Sequelize.STRING(32) },
      findings: { type: Sequelize.JSONB },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('listing_photos', ['listing_id']);

    await queryInterface.createTable('analyses', {
      id: id(Sequelize),
      listing_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'listings', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('queued', 'running', 'done', 'failed'),
        allowNull: false,
        defaultValue: 'queued',
      },
      progress: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      score: { type: Sequelize.INTEGER },
      result: { type: Sequelize.JSONB },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('analyses', ['listing_id']);

    await queryInterface.createTable('risk_flags', {
      id: id(Sequelize),
      analysis_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'analyses', key: 'id' },
        onDelete: 'CASCADE',
      },
      severity: { type: Sequelize.ENUM('low', 'medium', 'high', 'critical'), allowNull: false },
      category: { type: Sequelize.STRING(64), allowNull: false },
      evidence: { type: Sequelize.TEXT, allowNull: false },
      source: { type: Sequelize.ENUM('llm', 'vision', 'rag', 'market'), allowNull: false },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('risk_flags', ['analysis_id']);

    await queryInterface.createTable('market_snapshots', {
      id: id(Sequelize),
      vehicle_key: { type: Sequelize.STRING(255), allowNull: false },
      p25: { type: Sequelize.INTEGER, allowNull: false },
      p50: { type: Sequelize.INTEGER, allowNull: false },
      p75: { type: Sequelize.INTEGER, allowNull: false },
      sample_size: { type: Sequelize.INTEGER, allowNull: false },
      captured_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('market_snapshots', ['vehicle_key', 'captured_at']);

    await queryInterface.createTable('knowledge_chunks', {
      id: id(Sequelize),
      text: { type: Sequelize.TEXT, allowNull: false },
      make: { type: Sequelize.STRING(64) },
      model: { type: Sequelize.STRING(64) },
      engine: { type: Sequelize.STRING(64) },
      source: { type: Sequelize.TEXT },
      ...timestamps(Sequelize),
    });
    // 1536 вимірів — під модель ембедингів; змінювати разом із нею.
    await queryInterface.sequelize.query(
      'ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536)',
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)',
    );
    await queryInterface.addIndex('knowledge_chunks', ['make', 'model']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('knowledge_chunks');
    await queryInterface.dropTable('market_snapshots');
    await queryInterface.dropTable('risk_flags');
    await queryInterface.dropTable('analyses');
    await queryInterface.dropTable('listing_photos');
    await queryInterface.dropTable('listings');
    await queryInterface.dropTable('vehicles');
    await queryInterface.dropTable('users');
    for (const type of [
      'enum_listings_source',
      'enum_analyses_status',
      'enum_risk_flags_severity',
      'enum_risk_flags_source',
    ]) {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "' + type + '"');
    }
  },
};
