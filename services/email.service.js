const { Resend } = require('resend');
const path = require('path');
const ejs = require('ejs');
const { Booking, Flight, Airline, Airport, FareClass, BookingPassenger, User, Payment } = require('../models');

const resend = new Resend(process.env.RESEND_API_KEY);

class EmailService {
  /**
   * Send booking confirmation email after payment success
   */
  async sendBookingConfirmation(bookingId, pdfBuffer = null) {
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

    console.log(`[EMAIL] Attempting to send confirmation to ${recipientEmail} for booking ${bookingId}...`);
    try {
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured.');
      }
      const email = {
        from: process.env.EMAIL_FROM || '"Airline Booking" <noreply@airlinebooking.com>',
        to: recipientEmail,
        subject: `[Airline Booking] Xác nhận đặt vé - Mã: ${booking.booking_code}`,
        html: htmlContent,
      };
      if (pdfBuffer) email.attachments = [{ filename: 'ticket.pdf', content: pdfBuffer }];

      const { data, error } = await resend.emails.send(email);
      if (error) throw new Error(error.message || 'Resend rejected the email request.');
      console.log(`[EMAIL] SUCCESS - messageId: ${data && data.id}`);
    } catch (error) {
      console.error(`[EMAIL] FAILED: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send general email
   */
  async sendMail({ to, subject, html }) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || '"Airline Booking" <noreply@airlinebooking.com>',
      to,
      subject,
      html,
    });
    if (error) throw new Error(error.message || 'Resend rejected the email request.');
    return data;
  }
}

module.exports = new EmailService();
