const PDFDocument = require('pdfkit');
const { Booking, Flight, Airline, Airport, FareClass, BookingPassenger, User } = require('../models');
const { verifyBookingAccess } = require('../utils/bookingAccess.util');

class TicketService {
  /**
   * Generate ticket PDF buffer for a confirmed booking
   */
  async generateTicketPDF(bookingId, currentUser = null, guestEmail = null) {
    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Flight,
          as: 'flight',
          include: [
            { model: Airline, as: 'airline' },
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' },
          ],
        },
        { model: FareClass, as: 'fareClass' },
        { model: BookingPassenger, as: 'passengers' },
        { model: User, as: 'user', attributes: ['id', 'full_name', 'email'] },
      ],
    });

    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }

    if (booking.status !== 'confirmed') {
      const error = new Error('Ticket is only available for confirmed bookings');
      error.statusCode = 400;
      throw error;
    }

    verifyBookingAccess(booking, currentUser, guestEmail);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const flight = booking.flight;
        const airline = flight ? flight.airline : null;
        const depAirport = flight ? flight.departureAirport : null;
        const arrAirport = flight ? flight.arrivalAirport : null;

        // ---- Header ----
        doc
          .fontSize(22)
          .fillColor('#1a73e8')
          .text('✈ AIRLINE BOOKING', { align: 'center' });
        doc
          .fontSize(12)
          .fillColor('#555')
          .text('BOARDING PASS / VÉ MÁY BAY', { align: 'center' });
        doc.moveDown(0.5);

        doc
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .strokeColor('#1a73e8')
          .lineWidth(2)
          .stroke();
        doc.moveDown(0.5);

        // ---- Booking Info ----
        doc.fontSize(11).fillColor('#333');
        const infoY = doc.y;

        doc.text('MÃ ĐẶT VÉ:', 50, infoY, { continued: true });
        doc.fontSize(14).fillColor('#1a73e8').text(` ${booking.booking_code}`);
        doc.fontSize(11).fillColor('#333');

        doc.text('Trạng thái:', 50, doc.y, { continued: true });
        doc.fillColor('#34a853').text(' ĐÃ XÁC NHẬN ✓');
        doc.fillColor('#333');

        doc.moveDown(0.5);

        // ---- Flight Info ----
        doc
          .fontSize(13)
          .fillColor('#1a73e8')
          .text('THÔNG TIN CHUYẾN BAY', 50);
        doc
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .strokeColor('#ccc')
          .lineWidth(1)
          .stroke();
        doc.moveDown(0.3);

        doc.fontSize(11).fillColor('#333');
        if (airline) {
          doc.text(`Hãng hàng không: ${airline.name} (${airline.iata_code || ''})`, 50);
        }
        if (depAirport) {
          doc.text(`Điểm đi: ${depAirport.name} (${depAirport.iata_code}) — ${depAirport.city}, ${depAirport.country}`, 50);
        }
        if (arrAirport) {
          doc.text(`Điểm đến: ${arrAirport.name} (${arrAirport.iata_code}) — ${arrAirport.city}, ${arrAirport.country}`, 50);
        }
        if (flight) {
          doc.text(`Giờ khởi hành: ${new Date(flight.departure_time).toLocaleString('vi-VN')}`, 50);
          doc.text(`Giờ đến: ${new Date(flight.arrival_time).toLocaleString('vi-VN')}`, 50);
        }
        if (booking.fareClass) {
          doc.text(`Hạng ghế: ${booking.fareClass.class_name}`, 50);
        }
        doc.moveDown(0.5);

        // ---- Passengers ----
        doc
          .fontSize(13)
          .fillColor('#1a73e8')
          .text('DANH SÁCH HÀNH KHÁCH', 50);
        doc
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .strokeColor('#ccc')
          .lineWidth(1)
          .stroke();
        doc.moveDown(0.3);

        if (booking.passengers && booking.passengers.length > 0) {
          booking.passengers.forEach((p, idx) => {
            doc
              .fontSize(11)
              .fillColor('#333')
              .text(`${idx + 1}. ${p.passenger_name}`, 60, doc.y, { continued: true });
            if (p.seat_no) {
              doc.fillColor('#1a73e8').text(`  [Ghế: ${p.seat_no}]`);
            } else {
              doc.text('');
            }
          });
        }

        doc.moveDown(0.5);

        // ---- Amount ----
        doc
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .strokeColor('#1a73e8')
          .lineWidth(2)
          .stroke();
        doc.moveDown(0.3);
        doc
          .fontSize(13)
          .fillColor('#1a73e8')
          .text(`TỔNG TIỀN: ${Number(booking.total_amount).toLocaleString('vi-VN')} VND`, { align: 'right' });

        doc.moveDown(1.5);

        // ---- Footer ----
        doc
          .fontSize(9)
          .fillColor('#888')
          .text(
            'Vui lòng xuất trình vé này khi làm thủ tục check-in. Có hiệu lực khi được xác nhận bởi hệ thống Airline Booking.',
            50,
            doc.y,
            { align: 'center' }
          );
        doc.text(`In lúc: ${new Date().toLocaleString('vi-VN')}`, { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = new TicketService();
