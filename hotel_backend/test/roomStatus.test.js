const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bookingDao = require('../src/dao/bookingDao');

let updateImplementation;
bookingDao.updateRoomStatus = (...args) => updateImplementation(...args);
const { finishRoomCleaningHandler } = require('../src/controllers/bookingController');
const jwtSecret = process.env.JWT_SECRET || 'hotel-management-secret';

function createRequest(roleId, body, roomId = '17') {
  return {
    params: { roomId },
    body,
    headers: { authorization: `Bearer ${jwt.sign({ role_id: roleId }, jwtSecret)}` },
  };
}

function createResponse() {
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

test('Admin can move an AVAILABLE room to MAINTENANCE', async () => {
  let updateArgs;
  updateImplementation = async (...args) => {
    updateArgs = args;
    return { room_id: args[0], status: args[1] };
  };
  const response = createResponse();

  await finishRoomCleaningHandler(createRequest(4, {
    current_status: 'AVAILABLE',
    status: 'MAINTENANCE',
  }), response);

  assert.deepEqual(updateArgs, ['17', 'MAINTENANCE', 'AVAILABLE']);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.room.status, 'MAINTENANCE');
});

test('Admin can move a MAINTENANCE room back to AVAILABLE', async () => {
  let updateArgs;
  updateImplementation = async (...args) => {
    updateArgs = args;
    return { room_id: args[0], status: args[1] };
  };
  const response = createResponse();

  await finishRoomCleaningHandler(createRequest(4, {
    current_status: 'MAINTENANCE',
    status: 'AVAILABLE',
  }), response);

  assert.deepEqual(updateArgs, ['17', 'AVAILABLE', 'MAINTENANCE']);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.room.status, 'AVAILABLE');
});

test('non-admin cannot use either maintenance status transition', async () => {
  let daoCalls = 0;
  updateImplementation = async () => { daoCalls += 1; };
  const transitions = [
    { current_status: 'AVAILABLE', status: 'MAINTENANCE' },
    { current_status: 'MAINTENANCE', status: 'AVAILABLE' },
  ];

  for (const body of transitions) {
    const response = createResponse();
    await finishRoomCleaningHandler(createRequest(3, body), response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.success, false);
  }
  assert.equal(daoCalls, 0);
});

test('other room states are not changed by Admin maintenance actions', async () => {
  let daoCalls = 0;
  updateImplementation = async () => { daoCalls += 1; };
  const response = createResponse();

  await finishRoomCleaningHandler(createRequest(4, {
    current_status: 'OCCUPIED',
    status: 'MAINTENANCE',
  }), response);

  assert.equal(response.statusCode, 400);
  assert.equal(daoCalls, 0);
});

test('stale database status returns conflict without reporting success', async () => {
  updateImplementation = async () => { throw new Error('Room is not waiting for cleaning completion.'); };
  const response = createResponse();

  await finishRoomCleaningHandler(createRequest(4, {
    current_status: 'AVAILABLE',
    status: 'MAINTENANCE',
  }), response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.payload.success, false);
  assert.match(response.payload.message, /trạng thái phòng đã thay đổi/i);
});
