'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('airports', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      iata_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        unique: true,
        comment: 'Mã IATA sân bay (SGN, HAN, DAD…)',
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'Tên đầy đủ sân bay',
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Thành phố',
      },
      country: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Quốc gia',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    // FULLTEXT index cho autocomplete sân bay
    await queryInterface.addIndex('airports', ['name', 'city', 'iata_code'], {
      name: 'airports_search_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('airports');
  },
};
