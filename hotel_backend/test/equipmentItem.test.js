const test = require('node:test');
const assert = require('node:assert/strict');
const EquipmentItemModel = require('../src/models/equipmentItemModel');
const database = require('../src/config/db');

test('equipment name is trimmed and accepts a 100 character name', () => {
  const normalized = EquipmentItemModel.normalizeInput({ name: `  ${'a'.repeat(100)}  `, is_active: true });
  assert.equal(normalized.name, 'a'.repeat(100));
  assert.equal(normalized.name.length, 100);
});

test('equipment name rejects missing, whitespace-only, and overlong values', () => {
  for (const input of [
    { is_active: true },
    { name: '', is_active: true },
    { name: '   ', is_active: false },
    { name: 'a'.repeat(101), is_active: true },
  ]) {
    assert.throws(() => EquipmentItemModel.normalizeInput(input), {
      message: 'Equipment name is required and must not exceed 100 characters.',
      statusCode: 400,
    });
  }
});

test('equipment active status is required and must be boolean', () => {
  for (const is_active of [undefined, null, '', 0, 1, 'false']) {
    assert.throws(() => EquipmentItemModel.normalizeInput({ name: 'TV', is_active }), {
      message: 'Active status is required.',
      statusCode: 400,
    });
  }
  assert.equal(EquipmentItemModel.normalizeInput({ name: 'TV', is_active: false }).is_active, false);
});

test('equipment description is optional, nullable, trimmed, and limited to 500 characters', () => {
  const withoutDescription = EquipmentItemModel.normalizeInput({ name: 'TV', is_active: true });
  assert.equal(Object.hasOwn(withoutDescription, 'description'), false);
  assert.equal(EquipmentItemModel.normalizeInput({ name: 'TV', is_active: true, description: '  Room display  ' }).description, 'Room display');
  assert.equal(EquipmentItemModel.normalizeInput({ name: 'TV', is_active: true, description: '' }).description, null);
  assert.equal(EquipmentItemModel.normalizeInput({ name: 'TV', is_active: true, description: null }).description, null);
  assert.equal(EquipmentItemModel.normalizeInput({ name: 'TV', is_active: true, description: 'x'.repeat(500) }).description.length, 500);
  for (const description of ['x'.repeat(501), ' '.repeat(501), 42, false]) {
    assert.throws(() => EquipmentItemModel.normalizeInput({ name: 'TV', is_active: true, description }), {
      message: 'Equipment description must be text and must not exceed 500 characters.',
      statusCode: 400,
    });
  }
});

test('client supplied IDs are discarded before persistence', () => {
  assert.deepEqual(
    EquipmentItemModel.normalizeInput({ id: 987, name: 'TV', is_active: true }),
    { name: 'TV', is_active: true },
  );
});

test('equipment creation DAO inserts description as a parameter and returns the generated row', async () => {
  let queryText = '';
  const supplied = {};
  const originalGetPool = database.getPool;
  database.getPool = async () => ({
    request: () => ({
      input(name, _type, value) { supplied[name] = value; return this; },
      query: async (query) => {
        queryText = query;
        return { recordset: [{ id: 51, name: 'Air conditioner', description: 'Room cooling unit', is_active: true }] };
      },
    }),
  });
  delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  const equipmentItemDao = require('../src/dao/equipmentItemDao');

  try {
    const row = await equipmentItemDao.create({ id: 999, name: 'Air conditioner', description: 'Room cooling unit', is_active: true });
    assert.deepEqual({ id: row.id, name: row.name, description: row.description, is_active: row.is_active }, { id: 51, name: 'Air conditioner', description: 'Room cooling unit', is_active: true });
    assert.deepEqual(supplied, { name: 'Air conditioner', description: 'Room cooling unit', is_active: true });
    assert.match(queryText, /INSERT INTO dbo\.equipment_items \(name, description, is_active\)[\s\S]*OUTPUT INSERTED\.id, INSERTED\.name, INSERTED\.description, INSERTED\.is_active[\s\S]*VALUES \(@name, @description, @is_active\)/i);
    assert.doesNotMatch(queryText, /VALUES\s*\([^)]*@id/i);

    supplied.description = undefined;
    await equipmentItemDao.create({ name: 'Table lamp', is_active: true });
    assert.equal(supplied.description, null);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  }
});

test('equipment list reads all statuses from dbo.equipment_items without writes', async () => {
  const rows = [
    { id: 1, name: 'Television', description: 'Room display', is_active: true },
    { id: 2, name: 'Hair dryer', description: null, is_active: false },
  ];
  let queryText = '';
  const originalGetPool = database.getPool;
  database.getPool = async () => ({
    request: () => ({ query: async (query) => { queryText = query; return { recordset: rows }; } }),
  });
  delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  const equipmentItemDao = require('../src/dao/equipmentItemDao');

  try {
    const result = await equipmentItemDao.findAll();
    assert.deepEqual(result.map(({ id, name, description, is_active }) => ({ id, name, description, is_active })), rows);
    assert.match(queryText, /SELECT\s+id, name, description, is_active\s+FROM dbo\.equipment_items/i);
    assert.doesNotMatch(queryText, /WHERE\s+is_active/i);
    assert.doesNotMatch(queryText, /INSERT|UPDATE|DELETE/i);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  }
});

test('equipment details DAO returns description for the selected ID using a read-only parameterized query', async () => {
  let queryText = '';
  let suppliedId;
  const originalGetPool = database.getPool;
  database.getPool = async () => ({
    request: () => ({
      input(_name, _type, value) { suppliedId = value; return this; },
      query: async (query) => { queryText = query; return { recordset: [{ id: 42, name: 'Mini fridge', description: 'Compact refrigerator', is_active: false }] }; },
    }),
  });
  delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  const equipmentItemDao = require('../src/dao/equipmentItemDao');

  try {
    const item = await equipmentItemDao.findById(42);
    assert.deepEqual({ id: item.id, name: item.name, description: item.description, is_active: item.is_active }, { id: 42, name: 'Mini fridge', description: 'Compact refrigerator', is_active: false });
    assert.equal(suppliedId, 42);
    assert.match(queryText, /SELECT\s+id, name, description, is_active\s+FROM dbo\.equipment_items\s+WHERE id = @id/i);
    assert.doesNotMatch(queryText, /INSERT|UPDATE|DELETE/i);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  }
});

test('equipment list authorization rejects missing and non-admin tokens', () => {
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'hotel-management-secret';
  const { requireAdmin } = require('../src/utils/middleware/roleMiddleware');
  const callMiddleware = (authorization) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    let continued = false;
    requireAdmin({ headers: authorization ? { authorization } : {} }, response, () => { continued = true; });
    return { response, continued };
  };

  assert.equal(callMiddleware('').response.statusCode, 401);
  assert.equal(callMiddleware(`Bearer ${jwt.sign({ role_code: 'CUSTOMER' }, secret)}`).response.statusCode, 403);
  assert.equal(callMiddleware(`Bearer ${jwt.sign({ role_code: 'ADMIN' }, secret)}`).continued, true);
});

test('equipment details validates IDs before querying and passes the selected ID to the DAO', async () => {
  const equipmentItemDao = require('../src/dao/equipmentItemDao');
  const originalFindById = equipmentItemDao.findById;
  const queriedIds = [];
    equipmentItemDao.findById = async (id) => { queriedIds.push(id); return { id, name: 'Mini fridge', description: 'Compact refrigerator', is_active: false }; };
  const equipmentItemService = require('../src/services/equipmentItemService');

  try {
    for (const invalidId of ['', '0', '-1', '1.5', '1e2', '2147483648', 'not-an-id']) {
      await assert.rejects(equipmentItemService.getEquipmentItemById(invalidId), { statusCode: 400 });
    }
    assert.deepEqual(queriedIds, []);
    assert.deepEqual(await equipmentItemService.getEquipmentItemById('42'), {
      id: 42, name: 'Mini fridge', description: 'Compact refrigerator', is_active: false,
    });
    assert.deepEqual(queriedIds, [42]);
  } finally {
    equipmentItemDao.findById = originalFindById;
  }
});

test('equipment details controller separates not-found, validation, and server errors', async () => {
  const equipmentItemService = require('../src/services/equipmentItemService');
  const equipmentItemController = require('../src/controllers/equipmentItemController');
  const originalGetById = equipmentItemService.getEquipmentItemById;
  const originalConsoleError = console.error;
  const callController = async (id) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await equipmentItemController.getEquipmentItemById({ params: { id } }, response);
    return response;
  };

  try {
    console.error = () => {};
    equipmentItemService.getEquipmentItemById = async (id) => ({ id: Number(id), name: 'Television', description: 'Room display', is_active: true });
    const found = await callController('7');
    assert.equal(found.statusCode, 200);
    assert.deepEqual(found.body, { id: 7, name: 'Television', description: 'Room display', is_active: true });
    equipmentItemService.getEquipmentItemById = async () => null;
    assert.equal((await callController('999')).statusCode, 404);
    equipmentItemService.getEquipmentItemById = async () => { throw Object.assign(new Error('Invalid ID.'), { statusCode: 400 }); };
    assert.equal((await callController('bad')).statusCode, 400);
    equipmentItemService.getEquipmentItemById = async () => { throw new Error('database unavailable'); };
    assert.equal((await callController('1')).statusCode, 500);
  } finally {
    equipmentItemService.getEquipmentItemById = originalGetById;
    console.error = originalConsoleError;
  }
});

test('equipment create controller returns the description passed through the API body', async () => {
  const equipmentItemService = require('../src/services/equipmentItemService');
  const equipmentItemController = require('../src/controllers/equipmentItemController');
  const originalCreate = equipmentItemService.createEquipmentItem;
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    equipmentItemService.createEquipmentItem = async (body) => ({ id: 51, ...body });
    await equipmentItemController.createEquipmentItem({ body: { name: 'Air conditioner', description: 'Room cooling unit', is_active: true } }, response);
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.body, { id: 51, name: 'Air conditioner', description: 'Room cooling unit', is_active: true });
  } finally {
    equipmentItemService.createEquipmentItem = originalCreate;
  }
});

test('equipment update validates ID and payload before issuing an update', async () => {
  const equipmentItemDao = require('../src/dao/equipmentItemDao');
  const equipmentItemService = require('../src/services/equipmentItemService');
  const originalUpdate = equipmentItemDao.update;
  const calls = [];
  equipmentItemDao.update = async (...args) => { calls.push(args); return { id: args[0], ...args[1] }; };

  try {
    for (const id of ['', '0', '-1', '1.5', '1e2', '2147483648', 'not-an-id']) {
      await assert.rejects(equipmentItemService.updateEquipmentItem(id, { name: 'TV', is_active: true }), { statusCode: 400 });
    }
    for (const input of [
      { name: '', is_active: true },
      { name: '   ', is_active: false },
      { name: 'a'.repeat(101), is_active: true },
      { name: 'TV' },
      { name: 'TV', is_active: 0 },
    ]) {
      await assert.rejects(equipmentItemService.updateEquipmentItem(42, input), { statusCode: 400 });
    }
    assert.deepEqual(calls, []);

    assert.deepEqual(await equipmentItemService.updateEquipmentItem(42, { id: 99, name: '  Mini fridge  ', is_active: false }), {
      id: 42, name: 'Mini fridge', is_active: false,
    });
    assert.deepEqual(await equipmentItemService.updateEquipmentItem(43, { name: 'x'.repeat(100), is_active: true }), {
      id: 43, name: 'x'.repeat(100), is_active: true,
    });
    assert.deepEqual(calls, [
      [42, { name: 'Mini fridge', is_active: false }],
      [43, { name: 'x'.repeat(100), is_active: true }],
    ]);
  } finally {
    equipmentItemDao.update = originalUpdate;
  }
});

test('equipment update DAO returns description and preserves it when omitted from the update payload', async () => {
  let queryText = '';
  const supplied = {};
  const originalGetPool = database.getPool;
  database.getPool = async () => ({
    request: () => ({
      input(name, _type, value) { supplied[name] = value; return this; },
      query: async (query) => { queryText = query; return { recordset: [{ id: 42, name: 'Mini fridge', description: 'Existing description', is_active: false }] }; },
    }),
  });
  delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  const equipmentItemDao = require('../src/dao/equipmentItemDao');

  try {
    const result = await equipmentItemDao.update(42, { name: 'Mini fridge', is_active: false });
    assert.deepEqual({ id: result.id, name: result.name, description: result.description, is_active: result.is_active }, { id: 42, name: 'Mini fridge', description: 'Existing description', is_active: false });
    assert.deepEqual(supplied, { id: 42, name: 'Mini fridge', descriptionProvided: false, description: null, is_active: false });
    assert.match(queryText, /UPDATE dbo\.equipment_items\s+SET name = @name,\s+is_active = @is_active,\s+description = CASE WHEN @descriptionProvided = 1 THEN @description ELSE description END\s+OUTPUT INSERTED\.id, INSERTED\.name, INSERTED\.description, INSERTED\.is_active\s+WHERE id = @id/i);
    assert.doesNotMatch(queryText, /INSERT INTO/i);

    await equipmentItemDao.update(42, { name: 'Mini fridge', description: 'Updated description', is_active: false });
    assert.equal(supplied.descriptionProvided, true);
    assert.equal(supplied.description, 'Updated description');

    await equipmentItemDao.update(42, { name: 'Mini fridge', description: null, is_active: false });
    assert.equal(supplied.descriptionProvided, true);
    assert.equal(supplied.description, null);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  }
});

test('equipment update controller returns success, validation, not-found, and database errors accurately', async () => {
  const equipmentItemService = require('../src/services/equipmentItemService');
  const equipmentItemController = require('../src/controllers/equipmentItemController');
  const originalUpdate = equipmentItemService.updateEquipmentItem;
  const originalConsoleError = console.error;
  const callController = async (id, body) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await equipmentItemController.updateEquipmentItem({ params: { id }, body }, response);
    return response;
  };

  try {
    console.error = () => {};
    equipmentItemService.updateEquipmentItem = async (id, body) => ({ id: Number(id), ...body });
    const success = await callController('7', { name: 'TV', description: 'Wall mounted display', is_active: false });
    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.body.equipmentItem, { id: 7, name: 'TV', description: 'Wall mounted display', is_active: false });

    equipmentItemService.updateEquipmentItem = async () => null;
    assert.equal((await callController('999', { name: 'TV', is_active: true })).statusCode, 404);
    equipmentItemService.updateEquipmentItem = async () => { throw Object.assign(new Error('Active status is required.'), { statusCode: 400 }); };
    assert.equal((await callController('7', { name: 'TV' })).statusCode, 400);
    equipmentItemService.updateEquipmentItem = async () => { throw new Error('database unavailable'); };
    const failure = await callController('7', { name: 'TV', is_active: true });
    assert.equal(failure.statusCode, 500);
    assert.equal(failure.body.message, 'Unable to update equipment. Please try again.');
  } finally {
    equipmentItemService.updateEquipmentItem = originalUpdate;
    console.error = originalConsoleError;
  }
});

test('equipment update route is protected by Admin authorization', () => {
  const router = require('../src/routes');
  const { requireAdmin } = require('../src/utils/middleware/roleMiddleware');
  const route = router.stack.find((layer) => layer.route?.path === '/admin/equipment-items/:id' && layer.route.methods.put);
  assert.ok(route, 'PUT equipment route is registered');
  assert.equal(route.route.stack[0].handle, requireAdmin);
});

test('equipment delete validates IDs before issuing a delete', async () => {
  const servicePath = require.resolve('../src/services/equipmentItemService');
  const equipmentItemService = require('../src/services/equipmentItemService');
  const daoPath = require.resolve('../src/dao/equipmentItemDao');
  const daoModule = require.cache[servicePath].children.find((child) => child.id === daoPath);
  assert.ok(daoModule, 'equipment service loads its DAO');
  const equipmentItemDao = daoModule.exports;
  const originalDelete = equipmentItemDao.deleteById;
  const deletedIds = [];
  equipmentItemDao.deleteById = async (id) => { deletedIds.push(id); return id; };

  try {
    for (const id of ['', '0', '-1', '1.5', '1e2', '2147483648', 'bad']) {
      await assert.rejects(equipmentItemService.deleteEquipmentItem(id), { statusCode: 400 });
    }
    assert.deepEqual(deletedIds, []);
    assert.equal(await equipmentItemService.deleteEquipmentItem('42'), 42);
    assert.deepEqual(deletedIds, [42]);
  } finally {
    equipmentItemDao.deleteById = originalDelete;
  }
});

test('equipment delete DAO targets one parameterized ID and reports deleted rows only', async () => {
  let queryText = '';
  let suppliedId;
  let deletedRow = { id: 42 };
  const originalGetPool = database.getPool;
  database.getPool = async () => ({
    request: () => ({
      input(name, _type, value) { assert.equal(name, 'id'); suppliedId = value; return this; },
      query: async (query) => { queryText = query; return { recordset: deletedRow ? [deletedRow] : [] }; },
    }),
  });
  delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  const equipmentItemDao = require('../src/dao/equipmentItemDao');

  try {
    assert.equal(await equipmentItemDao.deleteById(42), 42);
    assert.equal(suppliedId, 42);
    assert.match(queryText, /DELETE FROM dbo\.equipment_items\s+OUTPUT DELETED\.id\s+WHERE id = @id/i);
    assert.doesNotMatch(queryText, /CASCADE|DELETE FROM dbo\.(room_problem_reports|equipment_assets)/i);

    deletedRow = null;
    assert.equal(await equipmentItemDao.deleteById(999), null);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentItemDao')];
  }
});

test('equipment delete controller maps success, missing IDs, references, and database failures accurately', async () => {
  const equipmentItemService = require('../src/services/equipmentItemService');
  const equipmentItemController = require('../src/controllers/equipmentItemController');
  const originalDelete = equipmentItemService.deleteEquipmentItem;
  const originalConsoleError = console.error;
  const callController = async (id) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await equipmentItemController.deleteEquipmentItem({ params: { id } }, response);
    return response;
  };

  try {
    console.error = () => {};
    equipmentItemService.deleteEquipmentItem = async (id) => Number(id);
    const success = await callController('42');
    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.body, { message: 'Equipment deleted successfully.', id: 42 });

    equipmentItemService.deleteEquipmentItem = async () => null;
    assert.equal((await callController('999')).statusCode, 404);
    equipmentItemService.deleteEquipmentItem = async () => { throw Object.assign(new Error('Equipment ID must be a positive integer.'), { statusCode: 400 }); };
    assert.equal((await callController('bad')).statusCode, 400);
    equipmentItemService.deleteEquipmentItem = async () => { throw Object.assign(new Error('conflict fk_rpr_equipment'), { number: 547 }); };
    const reportConflict = await callController('42');
    assert.equal(reportConflict.statusCode, 409);
    assert.equal(reportConflict.body.message, 'This equipment cannot be deleted because it is referenced by room problem reports.');
    equipmentItemService.deleteEquipmentItem = async () => { throw Object.assign(new Error('conflict FK_equipment_assets_item'), { number: 547 }); };
    const assetConflict = await callController('42');
    assert.equal(assetConflict.statusCode, 409);
    assert.equal(assetConflict.body.message, 'This equipment cannot be deleted because it is referenced by other records.');
    equipmentItemService.deleteEquipmentItem = async () => { throw new Error('database unavailable'); };
    const failure = await callController('42');
    assert.equal(failure.statusCode, 500);
    assert.deepEqual(failure.body, { message: 'Unable to delete equipment. Please try again.' });
  } finally {
    equipmentItemService.deleteEquipmentItem = originalDelete;
    console.error = originalConsoleError;
  }
});

test('equipment delete route is protected by Admin authorization', () => {
  const router = require('../src/routes');
  const { requireAdmin } = require('../src/utils/middleware/roleMiddleware');
  const route = router.stack.find((layer) => layer.route?.path === '/admin/equipment-items/:id' && layer.route.methods.delete);
  assert.ok(route, 'DELETE equipment route is registered');
  assert.equal(route.route.stack[0].handle, requireAdmin);
});
