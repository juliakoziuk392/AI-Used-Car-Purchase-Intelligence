const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const base = {
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_EXTERNAL_PORT || 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  migrationStorageTableName: 'sequelize_meta',
};

module.exports = {
  development: base,
  test: base,
  production: base,
};
