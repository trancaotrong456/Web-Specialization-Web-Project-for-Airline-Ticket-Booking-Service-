const createForbiddenError = () => {
  const error = new Error('Access denied to this booking');
  error.statusCode = 403;
  return error;
};

const isAdmin = (currentUser) =>
  Boolean(currentUser && currentUser.role && currentUser.role.name === 'admin');

/**
 * Enforce access to a booking for authenticated users and guest bookings.
 */
const verifyBookingAccess = (booking, currentUser = null, guestEmail = null) => {
  if (isAdmin(currentUser)) return;

  if (booking.user_id !== null) {
    if (!currentUser || Number(currentUser.id) !== Number(booking.user_id)) {
      throw createForbiddenError();
    }
    return;
  }

  const providedEmail = typeof guestEmail === 'string' ? guestEmail.trim().toLowerCase() : '';
  const bookingEmail = typeof booking.guest_email === 'string' ? booking.guest_email.trim().toLowerCase() : '';

  if (!providedEmail || !bookingEmail || providedEmail !== bookingEmail) {
    throw createForbiddenError();
  }
};

module.exports = { verifyBookingAccess, isAdmin };
