const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
const exampleEnvPath = path.resolve(__dirname, '../.env.example');
require('dotenv').config({ path: fs.existsSync(envPath) ? envPath : exampleEnvPath, override: true });

const express = require('express');
const cors = require('cors');
const { ensureAuthTables, ensureBookingStatusConstraint, ensureGuestIdCardOptional, ensureInvoiceCreatorColumn, ensureBookingPromotionColumns, ensureBookingCancellationReason, ensureReviewBookingColumn } = require('./config/db');
const bookingService = require('./services/bookingService');
const { prepareRuntimeDatabase } = require('./services/startupService');

const app = express();
const PORT = 5000;
const uploadsDir = path.join(__dirname, '../uploads');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/api', require('./routes'));

async function bootstrap() {
  await ensureAuthTables();
  await ensureBookingStatusConstraint();
  await ensureGuestIdCardOptional();
  await ensureInvoiceCreatorColumn();
  await ensureBookingPromotionColumns();
  await ensureBookingCancellationReason();
  await ensureReviewBookingColumn();
  await bookingService.expireStaleBookings();
  await prepareRuntimeDatabase(uploadsDir, PORT);

  app.listen(PORT, () => console.log('Hotel backend is running on http://localhost:' + PORT));
  const pendingBookingExpiryTimer = setInterval(() => {
    bookingService.expireStaleBookings().catch((error) => console.error('Booking expiry failed:', error.message));
  }, 60_000);
  pendingBookingExpiryTimer.unref?.();
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
