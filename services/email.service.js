const { Resend } = require('resend');
const path = require('path');
const ejs = require('ejs');
const { Booking, BookingSegment, Flight, Airline, Airport, FareClass, BookingPassenger, User, Payment } = require('../models');
const { redactString } = require('../shared/security/redactSensitive');

let resendClient = null;

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
};

const noopEmailAdapter = {
  async send() { return { id: 'test-email-noop', skipped: true }; },
};

const createResendAdapter = () => ({
  async send(email) {
    const { data, error } = await getResendClient().emails.send(email);
    if (error) throw new Error(error.message || 'Resend rejected the email request.');
    return data;
  },
});

class EmailService {
  setAdapter(adapter) {
    if (!adapter || typeof adapter.send !== 'function') throw new TypeError('Email adapter must expose send()');
    this._adapterOverride = adapter;
  }

  resetAdapter() { this._adapterOverride = null; }

  _getAdapter() {
    if (this._adapterOverride) return this._adapterOverride;
    // Tests are always isolated from Resend, even when live delivery is set.
    if (process.env.NODE_ENV === 'test') return noopEmailAdapter;
    const mode = (process.env.EMAIL_DELIVERY_MODE || (process.env.RESEND_API_KEY ? 'live' : 'disabled')).toLowerCase();
    if (mode !== 'live') return noopEmailAdapter;
    return createResendAdapter();
  }

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
        ...(BookingSegment ? [{ model: BookingSegment, as: 'itinerarySegments', include: [
          { model: Flight, as: 'flight', include: [
            { model: Airline, as: 'airline' },
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' },
          ] },
          { model: FareClass, as: 'fareClass' },
        ] }] : []),
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

    // Payment callbacks call this method without a pre-built attachment. Build
    // the confirmed ticket using the same owner/guest access rules as the
    // download endpoint, then attach it to the confirmation email.
    if (!pdfBuffer) {
      const ticketService = require('./ticket.service');
      const bookingOwner = booking.user_id ? { id: booking.user_id } : null;
      pdfBuffer = await ticketService.generateTicketPDF(
        booking.id,
        bookingOwner,
        booking.guest_email
      );
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
        itineraryFlights: [
          ...(booking.flight ? [{ flight: booking.flight, fareClass: booking.fareClass, leg_order: 1 }] : []),
          ...(booking.itinerarySegments || []).sort((a, b) => Number(a.leg_order) - Number(b.leg_order)),
        ],
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

    console.log(`[EMAIL] Attempting to send confirmation for booking ${bookingId}...`);
    try {
      const email = {
        from: process.env.EMAIL_FROM || '"Airline Booking" <noreply@airlinebooking.com>',
        to: recipientEmail,
        subject: `[Airline Booking] Xác nhận đặt vé - Mã: ${booking.booking_code}`,
        html: htmlContent,
      };
      email.attachments = [{
        filename: `ticket-${booking.booking_code}.pdf`,
        content: pdfBuffer.toString('base64'),
      }];

      const data = await this._getAdapter().send(email);
      console.log(`[EMAIL] SUCCESS - messageId: ${data && data.id}`);
    } catch (error) {
      console.error(`[EMAIL] FAILED: ${redactString(error.message)}`);
      throw error;
    }
  }

  /**
   * Send general email
   */
  async sendMail({ to, subject, html }) {
    return this._getAdapter().send({
      from: process.env.EMAIL_FROM || '"Airline Booking" <noreply@airlinebooking.com>',
      to,
      subject,
      html,
    });
  }
}

module.exports = new EmailService();
