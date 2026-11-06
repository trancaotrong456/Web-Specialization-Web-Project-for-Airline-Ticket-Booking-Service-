'use strict';

const { sequelize, Flight, FareClass } = require('../models');

// Danh sách các tuyến bay nội địa và thời lượng bay (phút)
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

// Tuyến bay quốc tế phổ biến từ Hà Nội / TP.HCM
const INTERNATIONAL_ROUTES = [
  // HAN - NRT (Tokyo Narita) & NRT - HAN (airports: 2, 28)
  { dep: 2, arr: 28, minutes: 330, times: ['00:30', '08:15', '23:35'], econPrice: 4850000, busPrice: 14200000, airlines: [1, 10, 11] },
  { dep: 28, arr: 2, minutes: 360, times: ['09:30', '16:00', '18:00'], econPrice: 4850000, busPrice: 14200000, airlines: [1, 10, 11] },

  // SGN - NRT & NRT - SGN (airports: 1, 28)
  { dep: 1, arr: 28, minutes: 345, times: ['00:15', '07:30', '23:50'], econPrice: 4950000, busPrice: 14800000, airlines: [1, 10, 11] },
  { dep: 28, arr: 1, minutes: 390, times: ['09:00', '17:45', '19:30'], econPrice: 4950000, busPrice: 14800000, airlines: [1, 10, 11] },

  // SGN - SIN (Singapore) & SIN - SGN (airports: 1, 23)
  { dep: 1, arr: 23, minutes: 125, times: ['07:15', '12:30', '16:15', '19:30'], econPrice: 1550000, busPrice: 5200000, airlines: [1, 2, 6] },
  { dep: 23, arr: 1, minutes: 125, times: ['09:45', '14:50', '18:30', '21:45'], econPrice: 1550000, busPrice: 5200000, airlines: [1, 2, 6] },

  // HAN - SIN & SIN - HAN (airports: 2, 23)
  { dep: 2, arr: 23, minutes: 195, times: ['09:00', '14:30', '18:00'], econPrice: 2050000, busPrice: 6300000, airlines: [1, 2, 6] },
  { dep: 23, arr: 2, minutes: 200, times: ['12:30', '18:00', '21:30'], econPrice: 2050000, busPrice: 6300000, airlines: [1, 2, 6] },

  // SGN - BKK (Bangkok) & BKK - SGN (airports: 1, 24)
  { dep: 1, arr: 24, minutes: 95, times: ['08:45', '11:30', '17:00'], econPrice: 1350000, busPrice: 4200000, airlines: [1, 2, 7] },
  { dep: 24, arr: 1, minutes: 95, times: ['10:45', '13:30', '19:00'], econPrice: 1350000, busPrice: 4200000, airlines: [1, 2, 7] },

  // HAN - BKK & BKK - HAN (airports: 2, 24)
  { dep: 2, arr: 24, minutes: 115, times: ['09:15', '13:00', '18:30'], econPrice: 1550000, busPrice: 4600000, airlines: [1, 2, 7] },
  { dep: 24, arr: 2, minutes: 115, times: ['11:30', '15:15', '20:45'], econPrice: 1550000, busPrice: 4600000, airlines: [1, 2, 7] },

  // SGN - ICN (Seoul Incheon) & ICN - SGN (airports: 1, 27)
  { dep: 1, arr: 27, minutes: 315, times: ['11:30', '22:15', '23:45'], econPrice: 3850000, busPrice: 11500000, airlines: [1, 2, 12] },
  { dep: 27, arr: 1, minutes: 335, times: ['08:00', '17:50', '21:15'], econPrice: 3850000, busPrice: 11500000, airlines: [1, 2, 12] },

  // HAN - ICN & ICN - HAN (airports: 2, 27)
  { dep: 2, arr: 27, minutes: 260, times: ['10:45', '23:15'], econPrice: 3750000, busPrice: 11000000, airlines: [1, 2, 12] },
  { dep: 27, arr: 2, minutes: 275, times: ['09:05', '18:30'], econPrice: 3750000, busPrice: 11000000, airlines: [1, 2, 12] },
];

// Danh sách các hãng hàng không nội địa chủ chốt (id 1..5)
const DOMESTIC_AIRLINE_IDS = [1, 2, 3, 4, 5]; // VN, VJ, QH, VU, BL

async function updateFlightDates() {
  console.log('=== BẮT ĐẦU CẬP NHẬT DỮ LIỆU CHUYẾN BAY MỚI (11/2026 - 02/2027) ===');

  const transaction = await sequelize.transaction();
  try {
    // 1. Cập nhật các chuyến bay trước ngày hiện tại (06/11/2026) thành 'completed'
    await sequelize.query(`
      UPDATE flights 
      SET status = 'completed' 
      WHERE departure_time < '2026-11-06 00:00:00' AND status = 'scheduled';
    `, { transaction });
    console.log(`Đã cập nhật các chuyến bay trong quá khứ thành 'completed'.`);

    // 2. Xóa các chuyến bay chưa có booking từ 06/11/2026 trở đi để nạp lại dữ liệu hoàn chỉnh
    await sequelize.query(`
      DELETE FROM fare_classes 
      WHERE flight_id IN (
        SELECT id FROM flights 
        WHERE departure_time >= '2026-11-06 00:00:00' 
          AND id NOT IN (SELECT flight_id FROM bookings)
      );
    `, { transaction });

    await sequelize.query(`
      DELETE FROM flights 
      WHERE departure_time >= '2026-11-06 00:00:00' 
        AND id NOT IN (SELECT flight_id FROM bookings);
    `, { transaction });
    console.log(`Đã chuẩn bị làm sạch các chuyến bay tương lai để nạp lịch bay mới.`);

    // 3. Tạo danh sách chuyến bay từ 06/11/2026 đến hết 28/02/2027 (gần 4 tháng: 115 ngày)
    const flightsToInsert = [];
    const fareClassesToInsert = [];

    const startDate = new Date('2026-11-06T00:00:00+07:00');
    const endDate = new Date('2027-02-28T23:59:59+07:00');

    let currentDay = new Date(startDate);
    let dayIndex = 0;

    while (currentDay <= endDate) {
      const year = currentDay.getFullYear();
      const month = String(currentDay.getMonth() + 1).padStart(2, '0');
      const day = String(currentDay.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // A. Tuyến nội địa
      for (const route of DOMESTIC_ROUTES) {
        for (let tIdx = 0; tIdx < route.times.length; tIdx++) {
          const timeStr = route.times[tIdx];
          const depTime = new Date(`${dateStr}T${timeStr}:00+07:00`);
          const arrTime = new Date(depTime.getTime() + route.minutes * 60 * 1000);

          const airlineId = DOMESTIC_AIRLINE_IDS[(dayIndex + tIdx + route.dep + route.arr) % DOMESTIC_AIRLINE_IDS.length];
          const totalSeats = 180;
          const availableSeats = 145 + ((dayIndex * 7 + tIdx * 11) % 30); // 145-174 ghế trống

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

      // B. Tuyến quốc tế
      for (const route of INTERNATIONAL_ROUTES) {
        for (let tIdx = 0; tIdx < route.times.length; tIdx++) {
          const timeStr = route.times[tIdx];
          const depTime = new Date(`${dateStr}T${timeStr}:00+07:00`);
          const arrTime = new Date(depTime.getTime() + route.minutes * 60 * 1000);

          const airlineList = route.airlines || DOMESTIC_AIRLINE_IDS;
          const airlineId = airlineList[(dayIndex + tIdx) % airlineList.length];
          const totalSeats = 250;
          const availableSeats = 210 + ((dayIndex * 5 + tIdx * 7) % 35); // 210-244 ghế trống

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

      // Tiến sang ngày tiếp theo
      currentDay.setDate(currentDay.getDate() + 1);
      dayIndex++;
    }

    console.log(`Tổng số chuyến bay sẽ được nạp mới (từ 06/11/2026 đến 28/02/2027): ${flightsToInsert.length}`);

    // Bulk insert từng lô 500 bản ghi
    const BATCH_SIZE = 500;
    for (let i = 0; i < flightsToInsert.length; i += BATCH_SIZE) {
      const batch = flightsToInsert.slice(i, i + BATCH_SIZE);

      const flightRows = batch.map((f) => ({
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

      for (let j = 0; j < createdFlights.length; j++) {
        const flightId = createdFlights[j].id;
        const sourceData = batch[j];

        // Economy fare
        fareClassesToInsert.push({
          flight_id: flightId,
          class_name: 'Economy',
          price: sourceData.econPrice,
          seat_quota: Math.round(sourceData.total_seats * 0.8),
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Business fare
        fareClassesToInsert.push({
          flight_id: flightId,
          class_name: 'Business',
          price: sourceData.busPrice,
          seat_quota: Math.round(sourceData.total_seats * 0.2),
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      if ((i + BATCH_SIZE) % 2500 === 0 || i + BATCH_SIZE >= flightsToInsert.length) {
        console.log(`Đã xử lý ${Math.min(i + BATCH_SIZE, flightsToInsert.length)}/${flightsToInsert.length} chuyến bay...`);
      }
    }

    console.log(`Đang chèn ${fareClassesToInsert.length} hạng vé (fare classes)...`);
    for (let i = 0; i < fareClassesToInsert.length; i += BATCH_SIZE) {
      const batch = fareClassesToInsert.slice(i, i + BATCH_SIZE);
      await FareClass.bulkCreate(batch, { transaction });
    }

    await transaction.commit();
    console.log('=== HOÀN TẤT CẬP NHẬT LỊCH BAY THÀNH CÔNG RỰC RỠ! ===');
  } catch (error) {
    await transaction.rollback();
    console.error('LỖI KHI CẬP NHẬT CHUYẾN BAY:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

updateFlightDates();
