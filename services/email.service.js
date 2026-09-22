const nodemailer = require('nodemailer');
const path = require('path');
const ejs = require('ejs');
const { Booking, Flight, Airline, Airport, FareClass, BookingPassenger, User, Payment } = require('../models');

// Create transporter (configured via .env)
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    connectionTimeout: 10000,
    socketTimeout: 10000,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });
};

class EmailService {
  /**
   * Send booking confirmation email after payment success
   */
  async sendBookingConfirmation(bookingId) {
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
        { model: Payment, as: 'payments' },
        { model: User, as: 'user', attributes: ['id', 'full_name', 'email'] },
      ],
    });

    if (!booking) {
      console.error(`[Email] Booking #${bookingId} not found`);
      return;
    }

    const recipientEmail = booking.user ? booking.user.email : booking.guest_email;
    const recipientName = booking.user ? booking.user.full_name : 'Valued Customer';

    if (!recipientEmail) {
      console.warn(`[Email] No recipient email for booking #${bookingId}`);
      return;
    }

    // Render email template
    const templatePath = path.join(__dirname, '../templates/emails/booking_confirmation.ejs');
    let htmlContent;
    try {
      htmlContent = await ejs.renderFile(templatePath, {
        booking,
        recipientName,
        flightDate: booking.flight ? new Date(booking.flight.departure_time).toLocaleString('vi-VN') : '',
        arrivalDate: booking.flight ? new Date(booking.flight.arrival_time).toLocaleString('vi-VN') : '',
      });
    } catch (templateErr) {
      console.error('[Email] Template render error:', templateErr.message);
      // Fallback: send plain text
      htmlContent = `
        <h2>Xác nhận đặt vé thành công</h2>
        <p>Kính gửi ${recipientName},</p>
        <p>Mã đặt vé của bạn: <strong>${booking.booking_code}</strong></p>
        <p>Tổng tiền: ${Number(booking.total_amount).toLocaleString('vi-VN')} VND</p>
        <p>Cảm ơn bạn đã sử dụng dịch vụ!</p>
      `;
    }

    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Airline Booking" <noreply@airlinebooking.com>',
      to: recipientEmail,
      subject: `[Airline Booking] Xác nhận đặt vé - Mã: ${booking.booking_code}`,
      html: htmlContent,
    });

    console.log(`[Email] Booking confirmation sent to ${recipientEmail} for booking #${bookingId}`);
  }

  /**
   * Send general email
   */
  async sendMail({ to, subject, html }) {
    const transporter = createTransporter();
    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Airline Booking" <noreply@airlinebooking.com>',
      to,
      subject,
      html,
    });
    return result;
  }
}

module.exports = new EmailService();
