function calculateNights(checkInDate, checkOutDate) {
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  const difference = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(difference / (1000 * 60 * 60 * 24)));
}

function generateBookingCode() {
  const timestamp = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `BK${timestamp}${randomSuffix}`;
}

module.exports = { calculateNights, generateBookingCode };
