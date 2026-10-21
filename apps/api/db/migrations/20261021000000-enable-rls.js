'use strict';

/**
 * RLS на всіх таблицях схеми public, без жодних політик. У Supabase схема public відкрита через
 * публічний Data API (PostgREST): без RLS таблиці (зокрема users) може читати й змінювати будь-хто з anon-ключем.
 * API підключається як власник таблиць, а на власника RLS не діє, тож для застосунку нічого не змінюється.
 * Нові таблиці в наступних міграціях теж мають отримувати `ENABLE ROW LEVEL SECURITY`.
 */
const forEachPublicTable = (action) => `
  DO $$
  DECLARE t text;
  BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('ALTER TABLE public.%I ${action} ROW LEVEL SECURITY', t);
    END LOOP;
  END $$;
`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(forEachPublicTable('ENABLE'));
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(forEachPublicTable('DISABLE'));
  },
};
