'use strict';

/** Пробіг тепер дістається з оголошення автоматично, тож може бути невідомим. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('listings', 'mileage', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('UPDATE listings SET mileage = 0 WHERE mileage IS NULL');
    await queryInterface.changeColumn('listings', 'mileage', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
