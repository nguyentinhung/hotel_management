const { sql, getPool } = require('./src/config/db');
const { createCustomerBooking } = require('./src/dao/bookingDao');

(async () => {
  const pool = await getPool();
  try {
    const indexes = await pool.request().query(`
      SELECT i.name AS index_name, i.is_unique, i.is_unique_constraint, c.name AS column_name
      FROM sys.indexes i
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID(N'dbo.users') AND i.is_unique = 1;`);
    console.log('=== unique indexes on users ===');
    console.log(JSON.stringify(indexes.recordset, null, 1));

    console.log('\n=== full DAO createCustomerBooking(customer 4) ===');
    const created = await createCustomerBooking({
      customerId: 4,
      roomSelections: [{ roomTypeId: 1, quantity: 1 }],
      serviceSelections: [],
      checkInDate: '2026-10-15',
      checkOutDate: '2026-10-16',
      adults: 2,
      children: 0,
      specialRequest: 'diag test',
    });
    console.log('RESULT', JSON.stringify(created));

    await pool.request()
      .input('bookingId', sql.BigInt, created.booking_id)
      .query(`
        DELETE bs FROM dbo.booking_services bs JOIN dbo.booking_rooms br ON br.id = bs.booking_room_id WHERE br.booking_id = @bookingId;
        DELETE FROM dbo.booking_guests WHERE booking_id = @bookingId;
        DELETE FROM dbo.booking_rooms WHERE booking_id = @bookingId;
        DELETE FROM dbo.bookings WHERE id = @bookingId;`);
    console.log('cleanup done for booking_id', created.booking_id);
  } catch (error) {
    console.log('ERROR', error.number, error.message);
  } finally {
    process.exit(0);
  }
})();
