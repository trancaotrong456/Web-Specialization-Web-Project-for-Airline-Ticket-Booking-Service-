const normalizeGuestEmail = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const resolveGuestEmail = (guestEmail, legacyEmail = undefined) => {
  const canonical = normalizeGuestEmail(guestEmail);
  const legacy = normalizeGuestEmail(legacyEmail);

  if (canonical && legacy && canonical !== legacy) {
    const error = new Error('guest_email and email must match');
    error.statusCode = 422;
    throw error;
  }

  return canonical || legacy;
};

module.exports = { normalizeGuestEmail, resolveGuestEmail };
