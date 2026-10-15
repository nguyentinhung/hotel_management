const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const roomDao = require('../src/dao/roomDao');

let deleteImplementation;
roomDao.deleteRoom = (...args) => deleteImplementation(...args);
const { deleteRoom } = require('../src/controllers/roomController');

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

test('delete room rejects invalid ids before calling the DAO', async () => {
  let calls = 0;
  deleteImplementation = async () => { calls += 1; };
  const response = createMockResponse();

  await deleteRoom({ params: { roomId: '0' } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(calls, 0);
});

test('delete room returns 404 when the DAO finds no room', async () => {
  deleteImplementation = async () => ({ reason: 'ROOM_NOT_FOUND' });
  const response = createMockResponse();

  await deleteRoom({ params: { roomId: '27' } }, response);

  assert.equal(response.statusCode, 404);
  assert.equal(response.payload.success, false);
});

test('delete room returns conflict when booking or maintenance data references it', async () => {
  deleteImplementation = async () => ({ reason: 'ROOM_REFERENCED' });
  const response = createMockResponse();

  await deleteRoom({ params: { roomId: '27' } }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.payload.message, /booking hoặc báo cáo bảo trì/i);
});

test('delete room returns success only when the DAO confirms deletion', async () => {
  let deletedId;
  deleteImplementation = async (roomId) => {
    deletedId = roomId;
    return { roomId };
  };
  const response = createMockResponse();

  await deleteRoom({ params: { roomId: '27' } }, response);

  assert.equal(deletedId, 27);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.success, true);
});

test('delete room translates foreign key violations to conflict', async () => {
  deleteImplementation = async () => { throw { number: 547 }; };
  const response = createMockResponse();

  await deleteRoom({ params: { roomId: '27' } }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.payload.message, /dữ liệu khác sử dụng/i);
});

test('delete endpoint is registered behind the Admin authorization middleware', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(source, /app\.delete\('\/api\/rooms\/:roomId',\s*requireAdmin,\s*deleteRoomHandler\)/);
});
