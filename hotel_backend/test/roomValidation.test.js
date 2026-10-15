const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRoom,
  updateRoom,
  validateFloor,
  validateRoomNumber,
} = require('../src/controllers/roomController');

test('room numbers must be positive digit strings of at most 10 characters', () => {
  for (const value of [undefined, '', '   ']) {
    assert.equal(validateRoomNumber(value).error, 'Vui lòng nhập số phòng.');
  }
  for (const value of ['0', '000', '-1', 'ABC', '12A', '12345678901']) {
    assert.notEqual(validateRoomNumber(value).error, '');
  }
  assert.deepEqual(validateRoomNumber('101'), { roomNumber: '101', error: '' });
  assert.deepEqual(validateRoomNumber('0101'), { roomNumber: '0101', error: '' });
});

test('floor validation distinguishes empty, non-integer, and out-of-range values', () => {
  assert.equal(validateFloor('').error, 'Vui lòng nhập số tầng.');
  assert.equal(validateFloor('   ').error, 'Vui lòng nhập số tầng.');
  assert.equal(validateFloor('ABC').error, 'Số tầng phải là số nguyên.');
  assert.equal(validateFloor('1.5').error, 'Số tầng phải là số nguyên.');
  assert.equal(validateFloor('-1').error, 'Số tầng không được nhỏ hơn 0.');
  assert.deepEqual(validateFloor('0'), { floor: 0, error: '' });
  assert.deepEqual(validateFloor('255'), { floor: 255, error: '' });
  assert.equal(validateFloor('256').error, 'Số tầng không được lớn hơn 255.');
});

for (const [operation, handler, roomId] of [
  ['Add Room', createRoom, undefined],
  ['Update Room', updateRoom, '1'],
]) {
  test(`${operation} rejects invalid room numbers before database access`, async () => {
    for (const roomNumber of ['   ', '0', '-1', 'ABC', '12A']) {
      const response = createMockResponse();
      const req = {
        params: roomId ? { roomId } : {},
        body: { room_number: roomNumber, room_type_id: 1, floor: 0 },
      };
      await handler(req, response);
      assert.equal(response.statusCode, 400, `expected ${roomNumber} to be rejected`);
      assert.match(response.payload.message, /số phòng/i);
    }
  });

  test(`${operation} rejects invalid floors before database access`, async () => {
    const cases = [
      ['', 'Vui lòng nhập số tầng.'],
      ['ABC', 'Số tầng phải là số nguyên.'],
      ['1.5', 'Số tầng phải là số nguyên.'],
      ['-1', 'Số tầng không được nhỏ hơn 0.'],
      ['256', 'Số tầng không được lớn hơn 255.'],
    ];
    for (const [floor, expectedMessage] of cases) {
      const response = createMockResponse();
      const req = {
        params: roomId ? { roomId } : {},
        body: { room_number: '101', room_type_id: 1, floor },
      };
      await handler(req, response);
      assert.equal(response.statusCode, 400, `expected floor ${floor} to be rejected`);
      assert.equal(response.payload.message, expectedMessage);
    }
  });
}

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}
