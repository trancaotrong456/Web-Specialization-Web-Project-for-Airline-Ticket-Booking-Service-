'use strict';

const { sequelize, Flight, FareClass } = require('../models');

// Danh sách các tuyến bay và thời lượng bay (phút)
const DOMESTIC_ROUTES = [
  // Trục vàng HAN - SGN
  { dep: 2, arr: 1, minutes: 130, times: ['06:00', '08:00', '10:00', '12:30', '14:30', '16:30', '18:30', '20:30'], econPrice: 1250000, busPrice: 3500000 },
  { dep: 1, arr: 2, minutes: 130, times: ['06:30', '08:30', '10:30', '13:00', '15:00', '17:00', '19:00', '21:00'], econPrice: 1250000, busPrice: 3500000 },

  // HAN - DAD & DAD - HAN
  { dep: 2, arr: 3, minutes: 85, times: ['07:00', '09:30', '12:00', '15:00', '18:00', '20:00'], econPrice: 890000, busPrice: 2600000 },
  { dep: 3, arr: 2, minutes: 85, times: ['07:30', '10:00', '12:30', '15:30', '18:30', '20:30'], econPrice: 890000, busPrice: 2600000 },

  // SGN - DAD & DAD - SGN
  { dep: 1, arr: 3, minutes: 85, times: ['06:45', '09:15', '11:45', '14:15', '17:15', '19:45'], econPrice: 890000, busPrice: 2600000 },
  { dep: 3, arr: 1, minutes: 85, times: ['07:15', '09:45', '12:15', '14:45', '17:45', '20:15'], econPrice: 890000, busPrice: 2600000 },

  // SGN - CXR (Nha Trang) & CXR - SGN
  { dep: 1, arr: 4, minutes: 65, times: ['07:00', '11:00', '14:30', '18:00'], econPrice: 750000, busPrice: 2200000 },
  { dep: 4, arr: 1, minutes: 65, times: ['08:30', '12:30', '16:00', '19:30'], econPrice: 750000, busPrice: 2200000 },

  // HAN - CXR & CXR - HAN
  { dep: 2, arr: 4, minutes: 115, times: ['07:15', '11:15', '15:00', '18:45'], econPrice: 1100000, busPrice: 3100000 },
  { dep: 4, arr: 2, minutes: 115, times: ['09:45', '13:45', '17:30', '21:15'], econPrice: 1100000, busPrice: 3100000 },

  // HAN - PQC (Phú Quốc) & PQC - HAN
  { dep: 2, arr: 5, minutes: 125, times: ['07:00', '10:45', '14:15', '17:30'], econPrice: 1450000, busPrice: 3900000 },
  { dep: 5, arr: 2, minutes: 125, times: ['09:45', '13:30', '17:00', '20:15'], econPrice: 1450000, busPrice: 3900000 },

  // SGN - PQC & PQC - SGN
  { dep: 1, arr: 5, minutes: 60, times: ['06:30', '09:00', '12:00', '15:00', '18:00'], econPrice: 790000, busPrice: 2300000 },
  { dep: 5, arr: 1, minutes: 60, times: ['08:00', '10:30', '13:30', '16:30', '19:30'], econPrice: 790000, busPrice: 2300000 },

  // SGN - HPH (Hải Phòng) & HPH - SGN
  { dep: 1, arr: 6, minutes: 125, times: ['08:00', '13:30', '19:00'], econPrice: 1200000, busPrice: 3400000 },
  { dep: 6, arr: 1, minutes: 125, times: ['10:45', '16:15', '21:45'], econPrice: 1200000, busPrice: 3400000 },

  // SGN - VII (Vinh) & VII - SGN
  { dep: 1, arr: 8, minutes: 110, times: ['07:30', '12:30', '17:30'], econPrice: 1150000, busPrice: 3200000 },
  { dep: 8, arr: 1, minutes: 110, times: ['10:00', '15:00', '20:00'], econPrice: 1150000, busPrice: 3200000 },

  // HAN - DLI (Đà Lạt) & DLI - HAN
  { dep: 2, arr: 16, minutes: 110, times: ['07:30', '12:30', '16:45'], econPrice: 1200000, busPrice: 3300000 },
  { dep: 16, arr: 2, minutes: 110, times: ['10:00', '15:00', '19:15'], econPrice: 1200000, busPrice: 3300000 },

  // SGN - DLI & DLI - SGN
  { dep: 1, arr: 16, minutes: 55, times: ['06:45', '11:15', '16:00'], econPrice: 650000, busPrice: 1900000 },
  { dep: 16, arr: 1, minutes: 55, times: ['08:15', '12:45', '17:30'], econPrice: 650000, busPrice: 1900000 },

  // HAN - HUI (Huế) & HUI - HAN
  { dep: 2, arr: 9, minutes: 75, times: ['08:15', '14:00', '18:30'], econPrice: 850000, busPrice: 2400000 },
  { dep: 9, arr: 2, minutes: 75, times: ['10:00', '15:45', '20:15'], econPrice: 850000, busPrice: 2400000 },

  // SGN - HUI & HUI - SGN
  { dep: 1, arr: 9, minutes: 85, times: ['07:45', '13:15', '17:45'], econPrice: 900000, busPrice: 2500000 },
  { dep: 9, arr: 1, minutes: 85, times: ['09:45', '15:15', '19:45'], econPrice: 900000, busPrice: 2500000 },

  // SGN - UIH (Quy Nhơn) & UIH - SGN
  { dep: 1, arr: 13, minutes: 70, times: ['08:00', '14:15'], econPrice: 780000, busPrice: 2200000 },
  { dep: 13, arr: 1, minutes: 70, times: ['09:45', '16:00'], econPrice: 780000, busPrice: 2200000 },

  // HAN - UIH & UIH - HAN
  { dep: 2, arr: 13, minutes: 95, times: ['08:30', '15:00'], econPrice: 950000, busPrice: 2700000 },
  { dep: 13, arr: 2, minutes: 95, times: ['10:45', '17:15'], econPrice: 950000, busPrice: 2700000 },

  // SGN - BMV (Buôn Ma Thuột) & BMV - SGN
  { dep: 1, arr: 15, minutes: 55, times: ['07:30', '15:30'], econPrice: 690000, busPrice: 2000000 },
  { dep: 15, arr: 1, minutes: 55, times: ['09:00', '17:00'], econPrice: 690000, busPrice: 2000000 },

  // SGN - VCS (Côn Đảo) & VCS - SGN
  { dep: 1, arr: 18, minutes: 50, times: ['08:00', '13:00'], econPrice: 1200000, busPrice: 2900000 },
  { dep: 18, arr: 1, minutes: 50, times: ['09:30', '14:30'], econPrice: 1200000, busPrice: 2900000 },

  // HAN - VCA (Cần Thơ) & VCA - HAN
  { dep: 2, arr: 7, minutes: 130, times: ['07:00', '14:30'], econPrice: 1350000, busPrice: 3600000 },
  { dep: 7, arr: 2, minutes: 130, times: ['09:45', '17:15'], econPrice: 1350000, busPrice: 3600000 },

  // HAN - DIN (Điện Biên) & DIN - HAN
  { dep: 2, arr: 17, minutes: 60, times: ['08:30', '14:00'], econPrice: 850000, busPrice: 2400000 },
  { dep: 17, arr: 2, minutes: 60, times: ['10:00', '15:30'], econPrice: 850000, busPrice: 2400000 },
];

// Danh sách các hãng hàng không nội địa chủ chốt (id 1..5)
const AIRLINE_IDS = [1, 2, 3, 4, 5]; // VN, VJ, QH, VU, BL

async function updateNovember2026Flights() {
  console.log('--- BẮT ĐẦU CẬP NHẬT CHUYẾN BAY THÁNG 11/2026 ---');

  const transaction = await sequelize.transaction();
  try {
    // 1. Cập nhật các chuyến bay trong quá khứ (trước 2026-10-30) thành 'completed'
    const [pastUpdate] = await sequelize.query(`
      UPDATE flights 
      SET status = 'completed' 
      WHERE departure_time < '2026-10-30 00:00:00' AND status = 'scheduled';
    `, { transaction });
    console.log(`Đã cập nhật các chuyến bay trong quá khứ thành 'completed'.`);

    // 2. Với các chuyến bay tháng 11/2026 đã có sẵn trong bảng, cập nhật status = 'scheduled'
    const [novExistingUpdate] = await sequelize.query(`
      UPDATE flights 
      SET status = 'scheduled', available_seats = total_seats 
      WHERE departure_time >= '2026-11-01 00:00:00' AND departure_time <= '2026-11-30 23:59:59'
        AND status != 'cancelled';
    `, { transaction });
    console.log(`Đã cập nhật các chuyến bay tháng 11 hiện có thành 'scheduled'.`);

    // 3. Xây dựng danh sách chuyến bay mới cho 30 ngày của tháng 11/2026 (01/11/2026 -> 30/11/2026)
    const flightsToInsert = [];
    const fareClassesToInsert = [];

    let flightIndex = 0;

    for (let day = 1; day <= 30; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `2026-11-${dayStr}`;

      for (const route of DOMESTIC_ROUTES) {
        for (let tIdx = 0; tIdx < route.times.length; tIdx++) {
          const timeStr = route.times[tIdx];
          const depTime = new Date(`${dateStr}T${timeStr}:00+07:00`);
          const arrTime = new Date(depTime.getTime() + route.minutes * 60 * 1000);

          // Phân bổ đều giữa các hãng hàng không
          const airlineId = AIRLINE_IDS[(day + tIdx + route.dep + route.arr) % AIRLINE_IDS.length];

          const totalSeats = 180;
          const availableSeats = 150 + ((day * 7 + tIdx * 11) % 25); // 150-174 ghế trống

          flightsToInsert.push({
            airline_id: airlineId,
            departure_airport_id: route.dep,
            arrival_airport_id: route.arr,
            departure_time: depTime,
            arrival_time: arrTime,
            total_seats: totalSeats,
            available_seats: availableSeats,
            status: 'scheduled',
            created_at: new Date(),
            updated_at: new Date(),
            econPrice: route.econPrice,
            busPrice: route.busPrice,
          });
        }
      }
    }

    console.log(`Tổng số chuyến bay tháng 11/2026 sẽ tạo mới: ${flightsToInsert.length}`);

    // Chèn từng lô (bulk insert) vào bảng flights
    const BATCH_SIZE = 500;
    for (let i = 0; i < flightsToInsert.length; i += BATCH_SIZE) {
      const batch = flightsToInsert.slice(i, i + BATCH_SIZE);
      
      const flightRows = batch.map(f => ({
        airline_id: f.airline_id,
        departure_airport_id: f.departure_airport_id,
        arrival_airport_id: f.arrival_airport_id,
        departure_time: f.departure_time,
        arrival_time: f.arrival_time,
        total_seats: f.total_seats,
        available_seats: f.available_seats,
        status: f.status,
        created_at: f.created_at,
        updated_at: f.updated_at,
      }));

      const createdFlights = await Flight.bulkCreate(flightRows, { transaction, returning: true });

      // Tạo fare classes cho từng chuyến bay vừa tạo
      for (let j = 0; j < createdFlights.length; j++) {
        const flightId = createdFlights[j].id;
        const sourceData = batch[j];

        // Economy
        fareClassesToInsert.push({
          flight_id: flightId,
          class_name: 'Economy',
          price: sourceData.econPrice,
          seat_quota: 144,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Business
        fareClassesToInsert.push({
          flight_id: flightId,
          class_name: 'Business',
          price: sourceData.busPrice,
          seat_quota: 36,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }

    console.log(`Đang chèn ${fareClassesToInsert.length} hạng vé (fare classes)...`);
    for (let i = 0; i < fareClassesToInsert.length; i += BATCH_SIZE) {
      const batch = fareClassesToInsert.slice(i, i + BATCH_SIZE);
      await FareClass.bulkCreate(batch, { transaction });
    }

    await transaction.commit();
    console.log('--- HOÀN TẤT CẬP NHẬT CHUYẾN BAY THÁNG 11/2026 THÀNH CÔNG! ---');

  } catch (error) {
    await transaction.rollback();
    console.error('LỖI KHI CẬP NHẬT CHUYẾN BAY:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

updateNovember2026Flights();
