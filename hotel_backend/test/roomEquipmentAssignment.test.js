const assert = require('node:assert/strict');
const test = require('node:test');
const database = require('../src/config/db');
const sql = database.sql;

function installDatabaseMock(queryHandler) {
  const originalGetPool = database.getPool;
  const originalRequest = sql.Request;
  const originalTransaction = sql.Transaction;
  const calls = [];
  const transactions = [];

  class FakeRequest {
    constructor(transaction = null) { this.transaction = transaction; this.inputs = {}; }
    input(name, _type, value) { this.inputs[name] = value; return this; }
    async query(statement) {
      const call = { statement, inputs: { ...this.inputs }, transaction: this.transaction };
      calls.push(call);
      return queryHandler(call, calls.length - 1);
    }
  }

  class FakeTransaction {
    constructor(pool) { this.pool = pool; this.events = []; transactions.push(this); }
    async begin(isolation) { this.isolation = isolation; this.events.push('begin'); }
    async commit() { this.events.push('commit'); }
    async rollback() { this.events.push('rollback'); }
  }

  sql.Request = FakeRequest;
  sql.Transaction = FakeTransaction;
  database.getPool = async () => ({ request: () => new FakeRequest() });
  return {
    calls,
    transactions,
    restore() {
      database.getPool = originalGetPool;
      sql.Request = originalRequest;
      sql.Transaction = originalTransaction;
    },
  };
}

const rows = (recordset) => ({ recordset });

test('room equipment DAO lists only active assignments with joined asset and equipment type data', async () => {
  const mock = installDatabaseMock(async () => rows([{ assignment_id: 7, equipment_asset_id: 44, asset_code: 'AC-44' }]));
  delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  try {
    const result = await dao.listActiveByRoomId(3);
    assert.equal(result[0].asset_code, 'AC-44');
    assert.equal(mock.calls[0].inputs.roomId, 3);
    assert.match(mock.calls[0].statement, /assignment\.unassigned_at IS NULL/i);
    assert.match(mock.calls[0].statement, /asset\.asset_code/);
    assert.match(mock.calls[0].statement, /item\.name AS equipment_item_name/);
    assert.match(mock.calls[0].statement, /assignment\.assigned_at/);
  } finally {
    mock.restore();
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  }
});

test('assignable equipment query excludes inactive types, non-AVAILABLE assets, and current assignments', async () => {
  const mock = installDatabaseMock(async () => rows([]));
  delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  try {
    await dao.listAssignableAssets(8);
    const query = mock.calls[0].statement;
    assert.match(query, /item\.is_active = 1/i);
    assert.match(query, /item\.id = @equipmentItemId/i);
    assert.equal(mock.calls[0].inputs.equipmentItemId, 8);
    assert.match(query, /asset\.status = 'AVAILABLE'/i);
    assert.match(query, /NOT EXISTS/i);
    assert.match(query, /assignment\.unassigned_at IS NULL/i);
  } finally {
    mock.restore();
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  }
});

test('assignment DAO uses a serializable locked transaction and persists a fresh assignment timestamp', async () => {
  const mock = installDatabaseMock(async ({ statement }) => {
    if (/FROM dbo\.rooms/i.test(statement)) return rows([{ id: 3 }]);
    if (/FROM dbo\.equipment_assets/i.test(statement)) return rows([{ id: 44, equipment_item_id: 8, equipment_item_mismatch: 0, status: 'AVAILABLE', is_active: true }]);
    if (/FROM dbo\.room_equipment_assignments/i.test(statement)) return rows([]);
    if (/INSERT INTO dbo\.room_equipment_assignments/i.test(statement)) {
      return rows([{ assignment_id: 90, room_id: 3, equipment_asset_id: 44, assigned_at: new Date('2026-10-24T10:00:00Z') }]);
    }
    throw new Error(`Unexpected query: ${statement}`);
  });
  delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  try {
    const result = await dao.assignToRoom(3, 44, 8);
    assert.equal(result.assignment.assignment_id, 90);
    assert.equal(mock.transactions[0].isolation, sql.ISOLATION_LEVEL.SERIALIZABLE);
    assert.deepEqual(mock.transactions[0].events, ['begin', 'commit']);
    assert.match(mock.calls[0].statement, /UPDLOCK, HOLDLOCK/i);
    assert.match(mock.calls[1].statement, /UPDLOCK, HOLDLOCK/i);
    assert.match(mock.calls[2].statement, /UPDLOCK, HOLDLOCK/i);
    assert.match(mock.calls[3].statement, /SYSUTCDATETIME\(\)/i);
    assert.equal(mock.calls[1].inputs.equipmentItemId, 8);
    assert.equal(mock.calls[3].inputs.roomId, 3);
    assert.equal(mock.calls[3].inputs.equipmentAssetId, 44);
  } finally {
    mock.restore();
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  }
});

test('assignment DAO rejects missing room, missing asset, inactive type, non-AVAILABLE asset, and current duplicate', async (t) => {
  const scenarios = [
    { name: 'missing room', responses: [rows([])], expected: 'room_not_found', queryCount: 1 },
    { name: 'missing asset', responses: [rows([{ id: 3 }]), rows([])], expected: 'asset_not_found', queryCount: 2 },
    { name: 'equipment type mismatch', responses: [rows([{ id: 3 }]), rows([{ id: 44, equipment_item_id: 9, equipment_item_mismatch: 1, status: 'AVAILABLE', is_active: true }])], expected: 'asset_type_mismatch', queryCount: 2 },
    { name: 'inactive equipment type', responses: [rows([{ id: 3 }]), rows([{ id: 44, equipment_item_id: 8, equipment_item_mismatch: 0, status: 'AVAILABLE', is_active: false }])], expected: 'equipment_type_inactive', queryCount: 2 },
    { name: 'maintenance asset', responses: [rows([{ id: 3 }]), rows([{ id: 44, equipment_item_id: 8, equipment_item_mismatch: 0, status: 'MAINTENANCE', is_active: true }])], expected: 'asset_not_available', queryCount: 2 },
    { name: 'retired asset', responses: [rows([{ id: 3 }]), rows([{ id: 44, equipment_item_id: 8, equipment_item_mismatch: 0, status: 'RETIRED', is_active: true }])], expected: 'asset_not_available', queryCount: 2 },
    { name: 'already assigned to same room', responses: [rows([{ id: 3 }]), rows([{ id: 44, equipment_item_id: 8, equipment_item_mismatch: 0, status: 'AVAILABLE', is_active: true }]), rows([{ id: 8, room_id: 3 }])], expected: 'already_assigned_to_room', queryCount: 3 },
    { name: 'assigned to another room', responses: [rows([{ id: 3 }]), rows([{ id: 44, equipment_item_id: 8, equipment_item_mismatch: 0, status: 'AVAILABLE', is_active: true }]), rows([{ id: 8, room_id: 5 }])], expected: 'assigned_to_another_room', queryCount: 3 },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    const firstAssetStatus = scenario.responses[1]?.recordset?.[0]?.status;
    const mock = installDatabaseMock(async () => scenario.responses.shift());
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
    const dao = require('../src/dao/roomEquipmentAssignmentDao');
    try {
      const result = await dao.assignToRoom(3, 44, 8);
      assert.deepEqual(result, {
        reason: scenario.expected,
        ...(scenario.expected === 'asset_not_available' ? { status: firstAssetStatus } : {}),
      });
      assert.equal(mock.calls.length, scenario.queryCount);
      assert.deepEqual(mock.transactions[0].events, ['begin', 'rollback']);
      assert.ok(mock.calls.every(({ inputs }) => Object.values(inputs).every((value) => typeof value !== 'string' || !value.includes('SELECT'))));
    } finally {
      mock.restore();
      delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
    }
  });
});

test('unique-index race is translated to an assignment conflict and rolled back', async () => {
  const mock = installDatabaseMock(async ({ statement }) => {
    if (/FROM dbo\.rooms/i.test(statement)) return rows([{ id: 3 }]);
    if (/FROM dbo\.equipment_assets/i.test(statement)) return rows([{ id: 44, equipment_item_id: 8, status: 'AVAILABLE', is_active: true }]);
    if (/FROM dbo\.room_equipment_assignments/i.test(statement)) return rows([]);
    if (/INSERT INTO dbo\.room_equipment_assignments/i.test(statement)) throw Object.assign(new Error('UX_rea_asset_active'), { number: 2627 });
    throw new Error(`Unexpected query: ${statement}`);
  });
  delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  try {
    assert.deepEqual(await dao.assignToRoom(3, 44, 8), { reason: 'assignment_conflict' });
    assert.deepEqual(mock.transactions[0].events, ['begin', 'rollback']);
  } finally {
    mock.restore();
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  }
});

test('foreign-key race is translated to a conflict and rolled back', async () => {
  const mock = installDatabaseMock(async ({ statement }) => {
    if (/FROM dbo\.rooms/i.test(statement)) return rows([{ id: 3 }]);
    if (/FROM dbo\.equipment_assets/i.test(statement)) return rows([{ id: 44, equipment_item_id: 8, equipment_item_mismatch: 0, status: 'AVAILABLE', is_active: true }]);
    if (/FROM dbo\.room_equipment_assignments/i.test(statement)) return rows([]);
    if (/INSERT INTO dbo\.room_equipment_assignments/i.test(statement)) throw Object.assign(new Error('FK_rea_asset'), { number: 547 });
    throw new Error(`Unexpected query: ${statement}`);
  });
  delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  try {
    assert.deepEqual(await dao.assignToRoom(3, 44, 8), { reason: 'assignment_reference_conflict' });
    assert.deepEqual(mock.transactions[0].events, ['begin', 'rollback']);
  } finally {
    mock.restore();
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  }
});

test('assignment service returns current list, validates route IDs, and maps missing room', async () => {
  const roomDao = require('../src/dao/roomDao');
  const assignmentDao = require('../src/dao/roomEquipmentAssignmentDao');
  const originalRoomDetails = roomDao.getRoomDetails;
  const originalList = assignmentDao.listActiveByRoomId;
  const originalAssignable = assignmentDao.listAssignableAssets;
  const originalAssign = assignmentDao.assignToRoom;
  try {
    roomDao.getRoomDetails = async (id) => id === 3 ? { id } : null;
    assignmentDao.listActiveByRoomId = async (id) => [{ room_id: id, equipment_asset_id: 44, asset_code: 'AC-44' }];
    assignmentDao.listAssignableAssets = async (equipmentItemId) => [{ equipment_asset_id: 44, equipment_item_id: equipmentItemId, status: 'AVAILABLE' }];
    assignmentDao.assignToRoom = async (roomId, assetId, equipmentItemId) => ({ assignment: { room_id: roomId, equipment_asset_id: assetId, equipment_item_id: equipmentItemId } });

    const service = require('../src/services/roomEquipmentAssignmentService');
    assert.equal((await service.getRoomAssignments(3))[0].asset_code, 'AC-44');
    assert.equal((await service.getAssignableAssets(3, 8))[0].equipment_asset_id, 44);
    assert.equal(await service.getRoomAssignments(999), null);
    assert.deepEqual(await service.assignEquipmentToRoom(3, 44, 8), { room_id: 3, equipment_asset_id: 44, equipment_item_id: 8 });
    await assert.rejects(service.assignEquipmentToRoom('bad', 44, 8), { statusCode: 400 });
    await assert.rejects(service.assignEquipmentToRoom(3, 'bad', 8), { statusCode: 400 });
    await assert.rejects(service.assignEquipmentToRoom(3, 44, 'bad'), { statusCode: 400 });
  } finally {
    roomDao.getRoomDetails = originalRoomDetails;
    assignmentDao.listActiveByRoomId = originalList;
    assignmentDao.listAssignableAssets = originalAssignable;
    assignmentDao.assignToRoom = originalAssign;
  }
});

test('assignment service maps all business conflicts and HTTP statuses', async () => {
  const roomDao = require('../src/dao/roomDao');
  const assignmentDao = require('../src/dao/roomEquipmentAssignmentDao');
  const originalRoomDetails = roomDao.getRoomDetails;
  const originalAssign = assignmentDao.assignToRoom;
  const service = require('../src/services/roomEquipmentAssignmentService');
  try {
    roomDao.getRoomDetails = async () => ({ id: 3 });
    const cases = [
      ['room_not_found', 404, /room not found/i],
      ['asset_not_found', 404, /asset not found/i],
      ['equipment_type_inactive', 409, /inactive/i],
      ['asset_not_available', 409, /maintenance/i, { status: 'MAINTENANCE' }],
      ['asset_not_available', 409, /retired/i, { status: 'RETIRED' }],
      ['already_assigned_to_room', 409, /already assigned to this room/i],
      ['assigned_to_another_room', 409, /another room/i],
      ['assignment_conflict', 409, /another request/i],
    ];
    for (const [reason, statusCode, message, extra = {}] of cases) {
      assignmentDao.assignToRoom = async () => ({ reason, ...extra });
      await assert.rejects(service.assignEquipmentToRoom(3, 44, 8), (error) => {
        assert.equal(error.statusCode, statusCode);
        assert.match(error.message, message);
        return true;
      });
    }
  } finally {
    roomDao.getRoomDetails = originalRoomDetails;
    assignmentDao.assignToRoom = originalAssign;
  }
});

test('assignment routes protect reads and writes with existing room and Admin authorization', async () => {
  const router = require('../src/routes');
  const { requireAdmin, requireRoomListAccess } = require('../src/utils/middleware/roleMiddleware');
  const paths = [
    ['get', '/rooms/:roomId/equipment-assets', requireRoomListAccess],
    ['get', '/rooms/:roomId/assignable-equipment-assets', requireAdmin],
    ['post', '/rooms/:roomId/equipment-assets', requireAdmin],
  ];
  for (const [method, routePath, middleware] of paths) {
    const layer = router.stack.find((entry) => entry.route?.path === routePath && entry.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} ${routePath} is registered`);
    assert.ok(layer.route.stack.some((entry) => entry.handle === middleware));
  }
});

test('assignment controller returns 201 only after service success and preserves API validation errors', async () => {
  const service = require('../src/services/roomEquipmentAssignmentService');
  const controller = require('../src/controllers/roomEquipmentAssignmentController');
  const originalAssign = service.assignEquipmentToRoom;
  const originalConsoleError = console.error;
  const responseFor = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    console.error = () => {};
    service.assignEquipmentToRoom = async () => ({ assignment_id: 9, equipment_asset_id: 44 });
    const success = responseFor();
    await controller.assignEquipmentToRoom({ params: { roomId: '3' }, body: { equipment_asset_id: 44, equipment_item_id: 8 } }, success);
    assert.equal(success.statusCode, 201);
    assert.equal(success.body.success, true);

    service.assignEquipmentToRoom = async () => { throw Object.assign(new Error('Already assigned.'), { statusCode: 409 }); };
    const conflict = responseFor();
    await controller.assignEquipmentToRoom({ params: { roomId: '3' }, body: { equipment_asset_id: 44, equipment_item_id: 8 } }, conflict);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.body.success, false);
    assert.equal(conflict.body.message, 'Already assigned.');

    service.assignEquipmentToRoom = async () => { throw Object.assign(new Error('Room not found.'), { statusCode: 404 }); };
    const missing = responseFor();
    await controller.assignEquipmentToRoom({ params: { roomId: '999' }, body: { equipment_asset_id: 44, equipment_item_id: 8 } }, missing);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.body.success, false);
  } finally {
    service.assignEquipmentToRoom = originalAssign;
    console.error = originalConsoleError;
  }
});

test('unassign DAO ends the active assignment and restores AVAILABLE in one serializable transaction', async () => {
  const mock = installDatabaseMock(async ({ statement }) => {
    if (/FROM dbo\.rooms/i.test(statement)) return rows([{ id: 3 }]);
    if (/FROM dbo\.equipment_assets/i.test(statement)) return rows([{ id: 44, status: 'AVAILABLE' }]);
    if (/FROM dbo\.room_equipment_assignments/i.test(statement)) return rows([{ id: 90, room_id: 3 }]);
    if (/UPDATE dbo\.room_equipment_assignments/i.test(statement)) return rows([{ assignment_id: 90, room_id: 3, equipment_asset_id: 44, unassigned_at: new Date() }]);
    if (/UPDATE dbo\.equipment_assets/i.test(statement)) return rows([{ id: 44 }]);
    throw new Error(`Unexpected query: ${statement}`);
  });
  delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  try {
    const result = await dao.unassignFromRoom(3, 44);
    assert.equal(result.assignment.assignment_id, 90);
    assert.equal(result.equipment_asset_id, 44);
    assert.equal(mock.transactions[0].isolation, sql.ISOLATION_LEVEL.SERIALIZABLE);
    assert.deepEqual(mock.transactions[0].events, ['begin', 'commit']);
    assert.match(mock.calls[0].statement, /FROM dbo\.rooms WITH \(UPDLOCK, HOLDLOCK\)/i);
    assert.match(mock.calls[1].statement, /FROM dbo\.equipment_assets WITH \(UPDLOCK, HOLDLOCK\)/i);
    assert.match(mock.calls[2].statement, /unassigned_at IS NULL/i);
    assert.match(mock.calls[3].statement, /SET unassigned_at = SYSUTCDATETIME\(\)/i);
    assert.match(mock.calls[3].statement, /OUTPUT INSERTED\.id/i);
    assert.match(mock.calls[4].statement, /SET status = 'AVAILABLE'/i);
    assert.match(mock.calls[4].statement, /WHERE id = @equipmentAssetId AND status = 'AVAILABLE'/i);
    assert.doesNotMatch(mock.calls[3].statement, /DELETE/i);
  } finally {
    mock.restore();
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  }
});

test('unassign DAO rejects missing, wrong-room, and non-AVAILABLE assets without changing records', async (t) => {
  const scenarios = [
    { name: 'missing room', responses: [rows([])], expected: 'room_not_found', count: 1 },
    { name: 'missing asset', responses: [rows([{ id: 3 }]), rows([])], expected: 'asset_not_found', count: 2 },
    { name: 'no active assignment', responses: [rows([{ id: 3 }]), rows([{ id: 44, status: 'AVAILABLE' }]), rows([])], expected: 'assignment_not_found', count: 3 },
    { name: 'assignment belongs to another room', responses: [rows([{ id: 3 }]), rows([{ id: 44, status: 'AVAILABLE' }]), rows([{ id: 90, room_id: 5 }])], expected: 'assigned_to_another_room', count: 3 },
    { name: 'maintenance status is preserved', responses: [rows([{ id: 3 }]), rows([{ id: 44, status: 'MAINTENANCE' }]), rows([{ id: 90, room_id: 3 }])], expected: 'asset_status_conflict', count: 3 },
    { name: 'retired status is preserved', responses: [rows([{ id: 3 }]), rows([{ id: 44, status: 'RETIRED' }]), rows([{ id: 90, room_id: 3 }])], expected: 'asset_status_conflict', count: 3 },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    const mock = installDatabaseMock(async () => scenario.responses.shift());
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
    const dao = require('../src/dao/roomEquipmentAssignmentDao');
    try {
      const result = await dao.unassignFromRoom(3, 44);
      assert.equal(result.reason, scenario.expected);
      assert.equal(mock.calls.length, scenario.count);
      assert.deepEqual(mock.transactions[0].events, ['begin', 'rollback']);
    } finally {
      mock.restore();
      delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
    }
  });
});

test('unassign DAO rolls back both updates when the asset status update fails', async () => {
  const mock = installDatabaseMock(async ({ statement }) => {
    if (/FROM dbo\.rooms/i.test(statement)) return rows([{ id: 3 }]);
    if (/FROM dbo\.equipment_assets/i.test(statement)) return rows([{ id: 44, status: 'AVAILABLE' }]);
    if (/FROM dbo\.room_equipment_assignments/i.test(statement)) return rows([{ id: 90, room_id: 3 }]);
    if (/UPDATE dbo\.room_equipment_assignments/i.test(statement)) return rows([{ assignment_id: 90 }]);
    if (/UPDATE dbo\.equipment_assets/i.test(statement)) throw new Error('database write failed');
    throw new Error(`Unexpected query: ${statement}`);
  });
  delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  try {
    await assert.rejects(dao.unassignFromRoom(3, 44), /database write failed/);
    assert.deepEqual(mock.transactions[0].events, ['begin', 'rollback']);
  } finally {
    mock.restore();
    delete require.cache[require.resolve('../src/dao/roomEquipmentAssignmentDao')];
  }
});

test('unassign service validates IDs and maps business conflicts', async () => {
  const dao = require('../src/dao/roomEquipmentAssignmentDao');
  const originalUnassign = dao.unassignFromRoom;
  delete require.cache[require.resolve('../src/services/roomEquipmentAssignmentService')];
  const service = require('../src/services/roomEquipmentAssignmentService');
  try {
    dao.unassignFromRoom = async (roomId, assetId) => ({ assignment: { room_id: roomId, equipment_asset_id: assetId } });
    assert.deepEqual(await service.unassignEquipmentFromRoom(3, 44), { room_id: 3, equipment_asset_id: 44 });
    await assert.rejects(service.unassignEquipmentFromRoom('bad', 44), (error) => error.statusCode === 400);
    await assert.rejects(service.unassignEquipmentFromRoom(3, 'bad'), (error) => error.statusCode === 400);
    for (const { reason, pattern, status } of [
      { reason: 'assignment_not_found', pattern: /not actively assigned/i },
      { reason: 'assigned_to_another_room', pattern: /another room/i },
      { reason: 'asset_status_conflict', pattern: /maintenance/i, status: 'MAINTENANCE' },
      { reason: 'asset_status_conflict', pattern: /retired/i, status: 'RETIRED' },
    ]) {
      dao.unassignFromRoom = async () => ({ reason, ...(status ? { status } : {}) });
      await assert.rejects(service.unassignEquipmentFromRoom(3, 44), (error) => {
        assert.equal(error.statusCode, 409);
        assert.match(error.message, pattern);
        return true;
      });
    }
  } finally {
    dao.unassignFromRoom = originalUnassign;
  }
});

test('unassign route is Admin-only and controller reports success only after persistence', async () => {
  const router = require('../src/routes');
  const { requireAdmin } = require('../src/utils/middleware/roleMiddleware');
  const route = router.stack.find((entry) => entry.route?.path === '/rooms/:roomId/equipment-assets/:equipmentAssetId' && entry.route.methods.delete);
  assert.ok(route);
  assert.ok(route.route.stack.some((entry) => entry.handle === requireAdmin));

  const service = require('../src/services/roomEquipmentAssignmentService');
  delete require.cache[require.resolve('../src/controllers/roomEquipmentAssignmentController')];
  const controller = require('../src/controllers/roomEquipmentAssignmentController');
  const originalUnassign = service.unassignEquipmentFromRoom;
  const responseFor = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    const success = responseFor();
    service.unassignEquipmentFromRoom = async (roomId, assetId) => ({ room_id: Number(roomId), equipment_asset_id: Number(assetId) });
    await controller.unassignEquipmentFromRoom({ params: { roomId: '3', equipmentAssetId: '44' } }, success);
    assert.equal(success.statusCode, 200);
    assert.equal(success.body.message, 'Đã gỡ thiết bị khỏi phòng thành công.');

    const conflict = responseFor();
    service.unassignEquipmentFromRoom = async () => { throw Object.assign(new Error('This equipment asset is RETIRED.'), { statusCode: 409 }); };
    await controller.unassignEquipmentFromRoom({ params: { roomId: '3', equipmentAssetId: '44' } }, conflict);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.body.success, false);
  } finally {
    service.unassignEquipmentFromRoom = originalUnassign;
  }
});
