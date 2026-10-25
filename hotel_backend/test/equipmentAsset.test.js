const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/config/db');
const EquipmentAssetModel = require('../src/models/equipmentAssetModel');

test('equipment asset model validates schema statuses and optional fields', () => {
  assert.deepEqual(EquipmentAssetModel.normalizeInput({
    asset_code: ' AC-001 ', serial_number: ' S-1 ', status: 'available', purchase_date: '2025-02-28', notes: ' note ',
  }), { asset_code: 'AC-001', serial_number: 'S-1', status: 'AVAILABLE', purchase_date: '2025-02-28', notes: 'note' });
  assert.deepEqual(EquipmentAssetModel.normalizeInput({ asset_code: 'AC-002', status: 'MAINTENANCE' }), {
    asset_code: 'AC-002', serial_number: null, status: 'MAINTENANCE', purchase_date: null, notes: null,
  });
  for (const input of [
    { asset_code: '', status: 'AVAILABLE' },
    { asset_code: 'A'.repeat(51), status: 'AVAILABLE' },
    { asset_code: 'AC-3', status: 'UNKNOWN' },
    { asset_code: 'AC-3', status: 'AVAILABLE', serial_number: 3 },
    { asset_code: 'AC-3', status: 'AVAILABLE', serial_number: 'S'.repeat(101) },
    { asset_code: 'AC-3', status: 'AVAILABLE', notes: 'N'.repeat(501) },
    { asset_code: 'AC-3', status: 'AVAILABLE', purchase_date: '2025-02-30' },
    { asset_code: 'AC-3', status: 'AVAILABLE', purchase_date: '02/28/2025' },
  ]) assert.throws(() => EquipmentAssetModel.normalizeInput(input), { statusCode: 400 });
});

test('equipment asset list DAO scopes by equipment type and only joins current room assignments', async () => {
  const originalGetPool = database.getPool;
  const supplied = {};
  let queryText = '';
  database.getPool = async () => ({ request: () => ({
    input(name, _type, value) { supplied[name] = value; return this; },
    async query(query) { queryText = query; return { recordset: [{ id: '9', equipment_item_id: 12, asset_code: 'AC-009', status: 'AVAILABLE', current_room_name: null }] }; },
  }) });
  delete require.cache[require.resolve('../src/dao/equipmentAssetDao')];
  const dao = require('../src/dao/equipmentAssetDao');
  try {
    const rows = await dao.findAllByEquipmentItemId(12);
    assert.equal(rows.length, 1);
    assert.deepEqual(supplied, { equipmentItemId: 12 });
    assert.match(queryText, /WHERE asset\.equipment_item_id = @equipmentItemId/i);
    assert.match(queryText, /assignment\.unassigned_at IS NULL/i);
    assert.match(queryText, /room\.room_number AS current_room_name/i);
    assert.doesNotMatch(queryText, /SELECT\s+\*/i);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentAssetDao')];
  }
});

test('equipment asset write DAO uses parameters and scopes update/delete to both parent and asset IDs', async () => {
  const originalGetPool = database.getPool;
  const supplied = {};
  const queries = [];
  database.getPool = async () => ({ request: () => ({
    input(name, _type, value) { supplied[name] = value; return this; },
    async query(query) {
      queries.push(query);
      if (/INSERT INTO/i.test(query)) return { recordset: [{ id: '100', equipment_item_id: 12, asset_code: 'AC-100', status: 'AVAILABLE' }] };
      if (/UPDATE/i.test(query)) return { recordset: [{ id: '100', equipment_item_id: 12, asset_code: "AC'100", status: 'RETIRED' }] };
      if (/SELECT asset\.id/i.test(query)) return { recordset: [{ id: '100', current_assignment_count: '0', historical_assignment_count: '0', inspection_item_count: '0', problem_report_count: '0' }] };
      return { recordset: [{ id: '100' }] };
    },
  }) });
  delete require.cache[require.resolve('../src/dao/equipmentAssetDao')];
  const dao = require('../src/dao/equipmentAssetDao');
  const input = { asset_code: "AC'100", serial_number: "S'; SELECT 1 --", status: 'RETIRED', purchase_date: null, notes: null };
  try {
    const created = await dao.create(12, input);
    assert.equal(created.id, '100');
    assert.equal(supplied.equipmentItemId, 12);
    assert.equal(supplied.assetCode, "AC'100");
    assert.match(queries[0], /INSERT INTO dbo\.equipment_assets/i);
    assert.match(queries[0], /FROM dbo\.equipment_items AS item WHERE item\.id = @equipmentItemId/i);
    assert.doesNotMatch(queries[0], /AC'100|S'; SELECT/i);

    await dao.update(12, '100', input);
    assert.equal(supplied.equipmentItemId, 12);
    assert.equal(supplied.assetId, '100');
    assert.match(queries[1], /WHERE equipment_item_id = @equipmentItemId AND id = @assetId/i);

    assert.equal(await dao.deleteById(12, '100'), '100');
    assert.match(queries[2], /room_equipment_assignments/);
    assert.match(queries[2], /room_inspection_items/);
    assert.match(queries[2], /room_problem_reports/);
    assert.match(queries[3], /WHERE equipment_item_id = @equipmentItemId AND id = @assetId/i);
    assert.match(queries[3], /DELETE FROM dbo\.equipment_assets/i);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentAssetDao')];
  }
});

test('equipment asset DAO blocks each protected reference and permits deleting an unreferenced asset', async () => {
  const originalGetPool = database.getPool;
  let referenceCounts = {};
  const queries = [];
  const supplied = {};
  database.getPool = async () => ({ request: () => ({
    input(name, _type, value) { supplied[name] = value; return this; },
    async query(query) {
      queries.push(query);
      if (/SELECT asset\.id/i.test(query)) return { recordset: [{ id: '200', ...referenceCounts }] };
      if (/DELETE FROM dbo\.equipment_assets/i.test(query)) return { recordset: [{ id: '200' }] };
      throw new Error('Unexpected query in delete DAO test.');
    },
  }) });
  delete require.cache[require.resolve('../src/dao/equipmentAssetDao')];
  const dao = require('../src/dao/equipmentAssetDao');
  try {
    const cases = [
      [{ current_assignment_count: '1', historical_assignment_count: '0', inspection_item_count: '0', problem_report_count: '0' }, 'current_assignment'],
      [{ current_assignment_count: '0', historical_assignment_count: '2', inspection_item_count: '0', problem_report_count: '0' }, 'historical_assignment'],
      [{ current_assignment_count: '0', historical_assignment_count: '0', inspection_item_count: '1', problem_report_count: '0' }, 'inspection_item'],
      [{ current_assignment_count: '0', historical_assignment_count: '0', inspection_item_count: '0', problem_report_count: '1' }, 'problem_report'],
    ];
    for (const [counts, expectedType] of cases) {
      referenceCounts = counts;
      queries.length = 0;
      await assert.rejects(dao.deleteById(12, '200'), { statusCode: 409, referenceType: expectedType });
      assert.equal(queries.length, 1, 'the actual DELETE must not run when a preserved reference exists');
      assert.equal(supplied.equipmentItemId, 12);
      assert.equal(supplied.assetId, '200');
    }

    referenceCounts = { current_assignment_count: '0', historical_assignment_count: '0', inspection_item_count: '0', problem_report_count: '0' };
    queries.length = 0;
    assert.equal(await dao.deleteById(12, '200'), '200');
    assert.equal(queries.length, 2);
    assert.match(queries[1], /DELETE FROM dbo\.equipment_assets/i);
  } finally {
    database.getPool = originalGetPool;
    delete require.cache[require.resolve('../src/dao/equipmentAssetDao')];
  }
});

test('equipment asset service validates IDs and prevents cross-type access', async () => {
  const itemDao = require('../src/dao/equipmentItemDao');
  const assetDao = require('../src/dao/equipmentAssetDao');
  const service = require('../src/services/equipmentAssetService');
  const originalFindItem = itemDao.findById;
  const originals = { ...assetDao };
  const calls = [];
  itemDao.findById = async (id) => id === 12 ? { id, name: 'Air conditioner' } : null;
  assetDao.findAllByEquipmentItemId = async (id) => { calls.push(['list', id]); return []; };
  assetDao.findById = async (...args) => { calls.push(['detail', ...args]); return args[0] === 12 ? { id: args[1] } : null; };
  assetDao.create = async (...args) => { calls.push(['create', ...args]); return { id: '19', equipment_item_id: args[0], ...args[1] }; };
  assetDao.update = async (...args) => { calls.push(['update', ...args]); return { id: args[1], equipment_item_id: args[0], ...args[2] }; };
  assetDao.deleteById = async (...args) => { calls.push(['delete', ...args]); return args[0] === 12 ? args[1] : null; };
  try {
    assert.deepEqual(await service.getEquipmentAssets(12), []);
    assert.equal(await service.getEquipmentAssets(99), null);
    assert.equal(await service.getEquipmentAsset(99, 45), null);
    assert.equal(await service.updateEquipmentAsset(99, 45, { asset_code: 'AC-45', status: 'AVAILABLE' }), null);
    assert.deepEqual(await service.getEquipmentAsset(12, 45), { id: 45 });
    await assert.rejects(service.getEquipmentAsset(12, 'bad'), { statusCode: 400 });
    const asset = await service.createEquipmentAsset(12, { asset_code: 'AC-19', status: 'AVAILABLE' });
    assert.equal(asset.equipment_item_id, 12);
    assert.equal(await service.updateEquipmentAsset(12, 45, { asset_code: 'AC-45', status: 'AVAILABLE' }).then((value) => value.id), 45);
    assert.equal(await service.deleteEquipmentAsset(99, 45), null);
    await assert.rejects(service.getEquipmentAssets('2147483648'), { statusCode: 400 });
    assert.deepEqual(calls.filter((call) => call[0] === 'list'), [['list', 12]]);
    assert.ok(calls.some((call) => call[0] === 'update' && call[1] === 12 && call[2] === 45));
    await assert.rejects(service.getEquipmentAssets('0'), { statusCode: 400 });
  } finally {
    itemDao.findById = originalFindItem;
    for (const key of Object.keys(originals)) assetDao[key] = originals[key];
  }
});

test('equipment asset service returns scoped 404 and explains protected references including FK race conflicts', async () => {
  const itemDao = require('../src/dao/equipmentItemDao');
  const assetDao = require('../src/dao/equipmentAssetDao');
  const service = require('../src/services/equipmentAssetService');
  const originalFindItem = itemDao.findById;
  const originals = { ...assetDao };
  itemDao.findById = async (id) => id === 12 ? { id } : null;
  const current = { currentAssignmentCount: 1, historicalAssignmentCount: 0 };
  try {
    assetDao.deleteById = async () => null;
    assert.equal(await service.deleteEquipmentAsset(12, 55), null, 'missing or cross-type asset is not deleted');
    assert.equal(await service.deleteEquipmentAsset(99, 55), null, 'missing equipment type is not deleted');

    const cases = [
      ['current_assignment', /Thiết bị vẫn đang được gán với phòng nên không thể xóa\./],
      ['historical_assignment', /lịch sử gán phòng nên không thể xóa/],
      ['inspection_item', /hồ sơ kiểm tra phòng nên không thể xóa/],
      ['problem_report', /báo cáo sự cố nên không thể xóa/],
    ];
    for (const [referenceType, expectedMessage] of cases) {
      assetDao.deleteById = async () => { throw Object.assign(new Error('protected reference'), { statusCode: 409, referenceType }); };
      await assert.rejects(service.deleteEquipmentAsset(12, 55), (error) => {
        assert.equal(error.statusCode, 409);
        assert.match(error.message, expectedMessage);
        return true;
      });
    }

    assetDao.deleteById = async () => { throw Object.assign(new Error('The DELETE statement conflicted with FK_rea_asset'), { number: 547 }); };
    assetDao.getDeleteReferenceState = async () => current;
    await assert.rejects(service.deleteEquipmentAsset(12, 55), (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.message, 'Thiết bị vẫn đang được gán với phòng nên không thể xóa.');
      return true;
    });

    assetDao.getDeleteReferenceState = async () => ({ currentAssignmentCount: 0, historicalAssignmentCount: 1 });
    await assert.rejects(service.deleteEquipmentAsset(12, 55), (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /lịch sử gán phòng nên không thể xóa/);
      assert.doesNotMatch(error.message, /đang được gắn/);
      return true;
    });

    for (const [foreignKey, expectedMessage] of [
      ['FK_room_inspection_items_asset', /hồ sơ kiểm tra phòng nên không thể xóa/],
      ['FK_rpr_equipment_asset', /báo cáo sự cố nên không thể xóa/],
      ['FK_unclassified', /dữ liệu khác tham chiếu nên không thể xóa/],
    ]) {
      assetDao.deleteById = async () => { throw Object.assign(new Error(`FK violation ${foreignKey}`), { number: 547 }); };
      await assert.rejects(service.deleteEquipmentAsset(12, 55), (error) => {
        assert.equal(error.statusCode, 409);
        assert.match(error.message, expectedMessage);
        return true;
      });
    }
  } finally {
    itemDao.findById = originalFindItem;
    for (const key of Object.keys(originals)) assetDao[key] = originals[key];
  }
});

test('equipment asset routes require Admin and controller maps missing, duplicate, and referenced cases', async () => {
  const router = require('../src/routes');
  const { requireAdmin } = require('../src/utils/middleware/roleMiddleware');
  for (const [method, routePath] of [
    ['get', '/admin/equipment-items/:equipmentItemId/assets'],
    ['post', '/admin/equipment-items/:equipmentItemId/assets'],
    ['get', '/admin/equipment-items/:equipmentItemId/assets/:assetId'],
    ['put', '/admin/equipment-items/:equipmentItemId/assets/:assetId'],
    ['delete', '/admin/equipment-items/:equipmentItemId/assets/:assetId'],
  ]) {
    const layer = router.stack.find((entry) => entry.route?.path === routePath && entry.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} ${routePath} is registered`);
    assert.ok(layer.route.stack.some((entry) => entry.handle === requireAdmin));
  }

  const service = require('../src/services/equipmentAssetService');
  const controller = require('../src/controllers/equipmentAssetController');
  const originalCreate = service.createEquipmentAsset;
  const originalDelete = service.deleteEquipmentAsset;
  const responseFor = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const originalConsoleError = console.error;
  try {
    console.error = () => {};
    service.createEquipmentAsset = async () => { throw Object.assign(new Error('duplicate'), { number: 2627 }); };
    const duplicate = responseFor();
    await controller.createEquipmentAsset({ params: { equipmentItemId: '12' }, body: {} }, duplicate);
    assert.equal(duplicate.statusCode, 409);

    service.deleteEquipmentAsset = async () => { throw Object.assign(new Error('FK_rea_asset conflict'), { number: 547 }); };
    const conflict = responseFor();
    await controller.deleteEquipmentAsset({ params: { equipmentItemId: '12', assetId: '100' } }, conflict);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.body.message, 'Thiết bị đang được dữ liệu khác tham chiếu nên không thể xóa.');

    service.deleteEquipmentAsset = async () => { throw Object.assign(new Error('Thiết bị có hồ sơ kiểm tra phòng nên không thể xóa.'), { statusCode: 409 }); };
    const specificConflict = responseFor();
    await controller.deleteEquipmentAsset({ params: { equipmentItemId: '12', assetId: '100' } }, specificConflict);
    assert.equal(specificConflict.statusCode, 409);
    assert.equal(specificConflict.body.message, 'Thiết bị có hồ sơ kiểm tra phòng nên không thể xóa.');

    service.deleteEquipmentAsset = async () => null;
    const missing = responseFor();
    await controller.deleteEquipmentAsset({ params: { equipmentItemId: '12', assetId: '999' } }, missing);
    assert.equal(missing.statusCode, 404);
  } finally {
    service.createEquipmentAsset = originalCreate;
    service.deleteEquipmentAsset = originalDelete;
    console.error = originalConsoleError;
  }
});
