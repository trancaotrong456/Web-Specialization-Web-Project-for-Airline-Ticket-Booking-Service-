'use strict';

const airlinesData = [
  { name: 'Vietnam Airlines', iata_code: 'VN', logo_url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05' },
  { name: 'Vietjet Air', iata_code: 'VJ', logo_url: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf' },
  { name: 'Bamboo Airways', iata_code: 'QH', logo_url: 'https://images.unsplash.com/photo-1520437358207-323b43b50729' },
  { name: 'Vietravel Airlines', iata_code: 'VU', logo_url: 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1' },
  { name: 'Pacific Airlines', iata_code: 'BL', logo_url: 'https://images.unsplash.com/photo-1583073037489-f55badb40393' },
  { name: 'Singapore Airlines', iata_code: 'SQ', logo_url: 'https://images.unsplash.com/photo-1529074963764-98f45c47344b' },
  { name: 'Thai Airways', iata_code: 'TG', logo_url: 'https://images.unsplash.com/photo-1506015391300-4802dc74de2e' },
  { name: 'Emirates', iata_code: 'EK', logo_url: 'https://images.unsplash.com/photo-1517999144091-3d9dca6d1e43' },
  { name: 'Qatar Airways', iata_code: 'QR', logo_url: 'https://images.unsplash.com/photo-1542296332-2e4473faf563' },
  { name: 'Japan Airlines', iata_code: 'JL', logo_url: 'https://images.unsplash.com/photo-1483450388369-9ed95738483c' },
  { name: 'All Nippon Airways', iata_code: 'NH', logo_url: 'https://images.unsplash.com/photo-1530521954074-e64f6810b32d' },
  { name: 'Korean Air', iata_code: 'KE', logo_url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f' },
  { name: 'Asiana Airlines', iata_code: 'OZ', logo_url: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1' },
  { name: 'Cathay Pacific', iata_code: 'CX', logo_url: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c' },
  { name: 'AirAsia', iata_code: 'AK', logo_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e' },
  { name: 'China Airlines', iata_code: 'CI', logo_url: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf' },
  { name: 'Eva Air', iata_code: 'BR', logo_url: 'https://images.unsplash.com/photo-1527631746610-bca00a040d60' },
  { name: 'Lufthansa', iata_code: 'LH', logo_url: 'https://images.unsplash.com/photo-1500835556837-99ac94a94552' },
  { name: 'Air France', iata_code: 'AF', logo_url: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a' },
  { name: 'British Airways', iata_code: 'BA', logo_url: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = airlinesData.map((item, index) => ({
      id: index + 1,
      name: item.name,
      iata_code: item.iata_code,
      logo_url: item.logo_url,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('airlines', rows, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('airlines', null, {});
  },
};
