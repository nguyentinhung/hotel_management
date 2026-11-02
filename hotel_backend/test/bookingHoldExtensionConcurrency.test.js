const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const daoSource = fs.readFileSync(path.join(__dirname, '../src/dao/bookingDao.js'), 'utf8');
const start = daoSource.indexOf('async function extendBookingHold(');
const end = daoSource.indexOf('\nasync function ', start + 1);
const extensionImplementation = daoSource.slice(start, end);

test('hold extension serializes concurrent requests and guards the max inside the transaction', () => {
  assert.match(extensionImplementation, /transaction\.begin\(sql\.ISOLATION_LEVEL\.SERIALIZABLE\)/);
  assert.match(extensionImplementation, /FROM dbo\.bookings b WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(extensionImplementation, /booking_hold_events bhe WITH \(HOLDLOCK\)/);
  assert.match(extensionImplementation, /count_events\.booking_id = @bookingId[\s\S]*?< @maxHoldExtensions/);
  assert.match(extensionImplementation, /INSERT INTO dbo\.booking_hold_events[\s\S]*?await transaction\.commit\(\)/);
});
