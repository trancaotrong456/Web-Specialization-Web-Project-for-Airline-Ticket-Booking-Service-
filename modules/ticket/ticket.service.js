
const PDFDocument = require('pdfkit');
const path = require('path');
const { verifyBookingAccess } = require('../../utils/bookingAccess.util');
const { normalizeGuestEmail } = require('../../utils/guestEmail.util');

const UNICODE_FONT_PATH = path.join(
  __dirname,
  '../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf'
);

class TicketService {
  constructor({ repository, pdfDocument = PDFDocument } = {}) {
    if (!repository) throw new TypeError('A Ticket repository is required');
    this.repository = repository;
    this.pdfDocument = pdfDocument;
  }

  /**
   * Generate ticket PDF buffer for a confirmed booking
   */
  async generateTicketPDF(bookingId, currentUser = null, guestEmail = null) {
    guestEmail = normalizeGuestEmail(guestEmail);
    const booking = await this.repository.findBookingForTicket(bookingId);

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
        const doc = new this.pdfDocument({ margin: 50, size: 'A4' });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // Register Unicode font for Vietnamese characters.
        doc.registerFont('DejaVuSans', UNICODE_FONT_PATH);
        doc.font('DejaVuSans');

        const flight = booking.flight;
        const airline = flight ? flight.airline : null;
        const depAirport = flight ? flight.departureAirport : null;
        const arrAirport = flight ? flight.arrivalAirport : null;

        const navy = '#12324a';
        const muted = '#475467';

        const pageBottom = () => doc.page.height - 120;

        const ensureSpace = (height) => {
          if (doc.y + height > pageBottom()) {
            doc.addPage();
            doc.y = 55;
          }
        };

        const sectionTitle = (label) => {
          ensureSpace(48);
          doc.moveDown(0.6);

          const y = doc.y;

          doc.fontSize(12).fillColor(navy).text(label, 50, y, {
            width: 495,
            lineBreak: false,
          });

          doc
            .moveTo(50, y + 22)
            .lineTo(545, y + 22)
            .strokeColor('#d8e1ea')
            .lineWidth(1)
            .stroke();

          doc.y = y + 32;
        };

        const money = (value) =>
          `${Number(value || 0).toLocaleString('vi-VN')} VND`;

        const dateTime = (value) =>
          value
            ? new Date(value).toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })
            : '—';

        const paymentStatus = (value) =>
          value === 'success'
            ? 'Đã thanh toán'
            : value || 'Chưa xác định';

        const paymentMethod = (value) =>
          value === 'payos'
            ? 'PayOS'
            : value === 'vnpay'
              ? 'VNPay'
              : value || '—';

        const drawCard = (top, height, fill = '#f7f9fc') => {
          doc
            .roundedRect(50, top, 495, height, 8)
            .fillAndStroke(fill, '#d8e1ea');

          doc.fillColor('#333');
        };

        // =========================
        // HEADER
        // =========================
        doc.roundedRect(0, 0, 595, 112, 0).fill(navy);

        doc
          .fontSize(22)
          .fillColor('#ffffff')
          .text('AIRLINE BOOKING', 50, 28);

        doc
          .fontSize(12)
          .fillColor('#cbd8e5')
          .text('E-TICKET / VÉ ĐIỆN TỬ', 50, 60);

        doc.roundedRect(390, 25, 155, 58, 8).fill('#1f4d6d');

        doc
          .fontSize(9)
          .fillColor('#cbd8e5')
          .text('BOOKING REFERENCE', 405, 35);

        doc
          .fontSize(17)
          .fillColor('#ffffff')
          .text(String(booking.booking_code), 405, 51);

        doc.fillColor('#333');
        doc.y = 130;

        // =========================
        // BOOKING INFORMATION
        // =========================
        const bookingTop = doc.y;

        drawCard(bookingTop, 78, '#f7fbff');

        doc
          .fontSize(9)
          .fillColor(muted)
          .text('MÃ ĐẶT VÉ', 70, bookingTop + 13, {
            width: 440,
          });

        doc
          .fontSize(15)
          .fillColor(navy)
          .text(String(booking.booking_code || '—'), 70, bookingTop + 30, {
            width: 305,
            height: 25,
            ellipsis: true,
          });

        doc
          .roundedRect(401, bookingTop + 27, 122, 28, 7)
          .fill('#e7f6ec');

        doc
          .fontSize(10)
          .fillColor('#16803c')
          .text('CONFIRMED', 410, bookingTop + 35, {
            width: 104,
            align: 'center',
            lineBreak: false,
          });

        doc.y = bookingTop + 78;

        // =========================
        // FLIGHT INFORMATION
        // =========================
        sectionTitle('THÔNG TIN CHUYẾN BAY');
        ensureSpace(190);

        const flightCardY = doc.y;
        drawCard(flightCardY, 178, '#f7fbff');

        const flightTop = flightCardY + 14;

        doc
          .fontSize(20)
          .fillColor(navy)
          .text(depAirport?.iata_code || '—', 72, flightTop, {
            width: 110,
            lineBreak: false,
          });

        doc
          .fontSize(20)
          .fillColor(navy)
          .text(arrAirport?.iata_code || '—', 414, flightTop, {
            width: 110,
            align: 'right',
            lineBreak: false,
          });

        doc
          .fontSize(9)
          .fillColor(muted)
          .text(depAirport?.city || '—', 68, flightTop + 29, {
            width: 120,
            align: 'center',
            height: 24,
          });

        doc
          .fontSize(9)
          .fillColor(muted)
          .text(arrAirport?.city || '—', 407, flightTop + 29, {
            width: 120,
            align: 'center',
            height: 24,
          });

        doc
          .moveTo(202, flightTop + 17)
          .lineTo(392, flightTop + 17)
          .strokeColor('#9bb5c9')
          .lineWidth(1.3)
          .stroke();

        doc
          .fontSize(14)
          .fillColor(navy)
          .text('✈', 286, flightTop + 4, {
            width: 25,
            align: 'center',
            lineBreak: false,
          });

        const airlineName = airline
          ? `${airline.name || '—'}${
              airline.iata_code ? ` (${airline.iata_code})` : ''
            }`
          : '—';

        doc
          .fontSize(10)
          .fillColor(navy)
          .text(`Hãng hàng không: ${airlineName}`, 70, flightTop + 60, {
            width: 450,
            height: 26,
            ellipsis: true,
          });

        doc
          .fontSize(9)
          .fillColor(muted)
          .text('KHỞI HÀNH', 70, flightTop + 96, {
            width: 205,
            lineBreak: false,
          });

        doc.text('ĐẾN NƠI', 315, flightTop + 96, {
          width: 205,
          lineBreak: false,
        });

        doc
          .fontSize(10)
          .fillColor(navy)
          .text(dateTime(flight?.departure_time), 70, flightTop + 111, {
            width: 205,
            lineBreak: false,
          });

        doc.text(dateTime(flight?.arrival_time), 315, flightTop + 111, {
          width: 205,
          lineBreak: false,
        });

        doc
          .fontSize(10)
          .fillColor('#344054')
          .text(
            `Hạng vé: ${booking.fareClass?.class_name || '—'}`,
            70,
            flightTop + 145,
            {
              width: 450,
              lineBreak: false,
            }
          );

        doc.y = flightCardY + 178;

        // =========================
        // ADDITIONAL FLIGHT SEGMENTS
        // =========================
        const additionalSegments = [
          ...(booking.itinerarySegments || []),
        ]
          .filter((segment) => Number(segment.leg_order) > 1)
          .sort((a, b) => Number(a.leg_order) - Number(b.leg_order));

        additionalSegments.forEach((segment) => {
          const segmentFlight = segment.flight;

          if (!segmentFlight) return;

          const segmentDeparture = segmentFlight.departureAirport;
          const segmentArrival = segmentFlight.arrivalAirport;

          ensureSpace(165);

          doc
            .fontSize(12)
            .fillColor(navy)
            .text(`CHẶNG ${segment.leg_order}`, 50);

          doc.fontSize(11).fillColor('#333');

          doc.text(
            `Hãng hàng không: ${segmentFlight.airline?.name || '—'}`,
            50
          );

          doc.text(
            `Điểm đi: ${segmentDeparture?.name || '—'} (${
              segmentDeparture?.iata_code || '—'
            }) — ${segmentDeparture?.city || ''}`,
            50
          );

          doc.text(
            `Điểm đến: ${segmentArrival?.name || '—'} (${
              segmentArrival?.iata_code || '—'
            }) — ${segmentArrival?.city || ''}`,
            50
          );

          doc.text(
            `Khởi hành: ${dateTime(segmentFlight.departure_time)}`,
            50
          );

          doc.text(
            `Đến nơi: ${dateTime(segmentFlight.arrival_time)}`,
            50
          );

          doc.text(
            `Hạng vé: ${segment.fareClass?.class_name || '—'}`,
            50
          );

          doc.moveDown(0.4);
        });

        // =========================
        // PASSENGER TABLE
        // =========================
        sectionTitle('DANH SÁCH HÀNH KHÁCH');

        if (booking.passengers?.length) {
          const nameWidth = 260;

          const drawTableHeader = (continued = false) => {
            if (continued) {
              sectionTitle('DANH SÁCH HÀNH KHÁCH (TIẾP)');
            }

            const y = doc.y;

            doc
              .roundedRect(50, y, 495, 34, 6)
              .fill('#edf3f8');

            doc.fontSize(9).fillColor(navy);

            doc.text('STT', 62, y + 11, {
              width: 32,
              lineBreak: false,
            });

            doc.text('HỌ TÊN', 105, y + 11, {
              width: nameWidth,
              lineBreak: false,
            });

            doc.text('GHẾ', 390, y + 11, {
              width: 45,
              lineBreak: false,
            });

            doc.text('HẠNG VÉ', 445, y + 11, {
              width: 85,
              lineBreak: false,
            });

            doc.y = y + 34;
          };

          ensureSpace(70);
          drawTableHeader();

          booking.passengers.forEach((p, idx) => {
            const name = String(p.passenger_name || '—');

            doc.fontSize(10).font('DejaVuSans');

            const nameHeight = doc.heightOfString(name, {
              width: nameWidth,
              lineGap: 2,
            });

            const fare = String(
              booking.fareClass?.class_name || '—'
            );

            const fareHeight = doc.heightOfString(fare, {
              width: 85,
              lineGap: 2,
            });

            const rowHeight = Math.max(
              34,
              Math.ceil(Math.max(nameHeight, fareHeight)) + 16
            );

            if (doc.y + rowHeight > pageBottom()) {
              doc.addPage();
              doc.y = 55;
              drawTableHeader(true);
            }

            const rowY = doc.y;

            if (idx % 2 === 0) {
              doc
                .rect(50, rowY, 495, rowHeight)
                .fill('#f8fafc');
            }

            doc
              .moveTo(60, rowY + rowHeight)
              .lineTo(535, rowY + rowHeight)
              .strokeColor('#e4eaf0')
              .lineWidth(0.6)
              .stroke();

            doc.fontSize(10).fillColor('#344054');

            doc.text(String(idx + 1), 62, rowY + 9, {
              width: 32,
              height: rowHeight - 12,
            });

            doc.text(name, 105, rowY + 8, {
              width: nameWidth,
              height: rowHeight - 12,
              lineGap: 2,
            });

            doc.text(String(p.seat_no || '—'), 390, rowY + 9, {
              width: 45,
              height: rowHeight - 12,
            });

            doc.text(fare, 445, rowY + 8, {
              width: 85,
              height: rowHeight - 12,
              lineGap: 2,
            });

            doc.y = rowY + rowHeight;
          });
        }

        // =========================
        // ANCILLARY SERVICES
        // =========================
        if (booking.ancillaries?.length) {
          ensureSpace(60);

          doc
            .moveDown(0.4)
            .fontSize(13)
            .fillColor(navy)
            .text('DỊCH VỤ BỔ SUNG', 50);

          doc.fontSize(10).fillColor('#333');

          booking.ancillaries.forEach((line) => {
            const leg = Number(line.segment?.leg_order || 1);

            const passengerName =
              line.passenger?.passenger_name || 'Hành khách';

            ensureSpace(36);

            doc.text(
              `Chặng ${leg} · ${passengerName}: ${
                line.service_name_snapshot
              } — ${line.offer_name_snapshot} × ${
                line.quantity
              } · ${Number(
                line.line_total_snapshot
              ).toLocaleString('vi-VN')} ${line.currency_snapshot}`,
              50
            );
          });
        }

        doc.y += 18;

        // =========================
        // PAYMENT CARD
        // =========================
        ensureSpace(98);

        const paymentCardY = doc.y;

        drawCard(paymentCardY, 82, '#f7fbff');

        const payment =
          (booking.payments || []).find(
            (item) => item.status === 'success'
          ) || booking.payments?.[0];

        const paymentTop = paymentCardY + 13;

        doc
          .fontSize(9)
          .fillColor(muted)
          .text('TRẠNG THÁI THANH TOÁN', 70, paymentTop, {
            width: 220,
            lineBreak: false,
          });

        if (payment) {
          doc
            .fontSize(11)
            .fillColor(
              payment.status === 'success'
                ? '#16803c'
                : '#344054'
            )
            .text(
              paymentStatus(payment.status),
              70,
              paymentTop + 15,
              {
                width: 220,
                lineBreak: false,
              }
            );

          doc
            .fontSize(9)
            .fillColor('#344054')
            .text(
              `Phương thức: ${paymentMethod(
                payment.payment_method
              )}`,
              70,
              paymentTop + 35,
              {
                width: 220,
                lineBreak: false,
              }
            );

          doc.text(
            `Thời gian: ${dateTime(payment.paid_at)}`,
            70,
            paymentTop + 51,
            {
              width: 220,
              lineBreak: false,
            }
          );
        } else {
          doc
            .fontSize(10)
            .fillColor('#344054')
            .text('Chưa có thông tin thanh toán', 70, paymentTop + 23, {
              width: 220,
            });
        }

        doc
          .fontSize(9)
          .fillColor(muted)
          .text('TOTAL / TỔNG TIỀN', 318, paymentTop + 1, {
            width: 202,
            align: 'right',
            lineBreak: false,
          });

        doc
          .fontSize(15)
          .fillColor(navy)
          .text(money(booking.total_amount), 310, paymentTop + 25, {
            width: 210,
            align: 'right',
            lineBreak: false,
          });

        doc.y = paymentCardY + 82;

        // =========================
        // FOOTER
        // =========================
        const footerHeight = 64;
        const footerY = doc.page.height - 45 - footerHeight;

        if (doc.y > footerY - 12) {
          doc.addPage();
          doc.y = 55;
        }

        const y = doc.page.height - 45 - footerHeight;

        doc
          .moveTo(50, y)
          .lineTo(545, y)
          .strokeColor('#d0d5dd')
          .lineWidth(1)
          .stroke();

        doc
          .fontSize(9)
          .fillColor('#475467')
          .text(
            'Vui lòng có mặt sớm tại sân bay và chuẩn bị giấy tờ hợp lệ khi làm thủ tục. Đây là vé điện tử, không phải thẻ lên máy bay.',
            50,
            y + 10,
            {
              width: 495,
              height: 28,
              align: 'center',
              lineGap: 1,
            }
          );

        doc
          .fontSize(9)
          .fillColor('#475467')
          .text(
            `In lúc: ${new Date().toLocaleString('vi-VN')}`,
            50,
            y + 44,
            {
              width: 495,
              height: 13,
              align: 'center',
              lineBreak: false,
            }
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = TicketService;
