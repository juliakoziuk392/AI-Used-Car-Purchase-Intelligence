'use strict';

/** Ціну більше не вводить користувач — вона береться з оголошення й може бути невідомою. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('listings', 'price', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('UPDATE listings SET price = 0 WHERE price IS NULL');
    await queryInterface.changeColumn('listings', 'price', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
