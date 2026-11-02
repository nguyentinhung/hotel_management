function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidPhone(phone) {
  return /^\+?[0-9\s\-()]{9,20}$/.test(String(phone || '').trim());
}

function normalizePhone(phone) {
  return String(phone || '').trim();
}

module.exports = { normalizeEmail, isValidEmail, isValidPhone, normalizePhone };
