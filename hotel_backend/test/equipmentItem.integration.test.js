const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({
  path: fs.existsSync(path.join(backendRoot, '.env')) ? path.join(backendRoot, '.env') : path.join(backendRoot, '.env.example'),
  override: true,
  quiet: true,
});

const enabled = process.env.RUN_EQUIPMENT_DB_INTEGRATION === '1';
test('equipment description database integration (explicitly gated)', { skip: !enabled }, async () => {
  const { getPool, sql } = require('../src/config/db');
  const equipmentItemService = require('../src/services/equipmentItemService');
  const equipmentItemDao = require('../src/dao/equipmentItemDao');
  let ownedId = null;
  let connected = false;

  try {
    const pool = await getPool();
    connected = true;
    const target = await pool.request().query(`
      SELECT CONVERT(nvarchar(128), SERVERPROPERTY('ServerName')) AS server_name, DB_NAME() AS database_name
    `);
    assert.equal(target.recordset[0].server_name, 'LAPTOP-FF5K1DE4', 'integration test target server must match the reviewed server');
    assert.equal(target.recordset[0].database_name, 'hotel_management', 'integration test target database must match the reviewed database');

    const descriptionColumn = await pool.request().query(`
      SELECT TYPE_NAME(system_type_id) AS type_name, max_length, is_nullable
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.equipment_items') AND name = N'description'
    `);
    assert.deepEqual(descriptionColumn.recordset, [{ type_name: 'nvarchar', max_length: 1000, is_nullable: true }]);

    const marker = `IT_DESCRIPTION_${randomUUID()}`;
    const created = await equipmentItemService.createEquipmentItem({
      name: marker,
      description: "Test description with SQL-like text: '; DROP TABLE dbo.equipment_items; --",
      is_active: true,
    });
    ownedId = created.id;
    assert.ok(Number.isInteger(ownedId) && ownedId > 0, 'database must generate an equipment ID');

    const listed = await equipmentItemService.getEquipmentItems();
    const activeAndInactive = listed.filter((item) => item.is_active === true || item.is_active === false || item.is_active === 1 || item.is_active === 0);
    assert.ok(activeAndInactive.some((item) => item.is_active === true || item.is_active === 1));
    assert.ok(activeAndInactive.some((item) => item.is_active === false || item.is_active === 0));
    assert.equal(listed.filter((item) => item.id === ownedId).length, 1);
    assert.equal(listed.find((item) => item.id === ownedId).description, created.description);

    const details = await equipmentItemService.getEquipmentItemById(ownedId);
    assert.equal(details.description, created.description);
    assert.equal(await equipmentItemService.getEquipmentItemById(2147483647), null);

    const changedDescription = 'Edited in gated equipment integration test';
    const updated = await equipmentItemService.updateEquipmentItem(ownedId, {
      name: `${marker}_UPDATED`, description: changedDescription, is_active: false,
    });
    assert.equal(updated.id, ownedId);
    assert.equal(updated.description, changedDescription);
    assert.equal((await equipmentItemService.getEquipmentItems()).filter((item) => item.id === ownedId).length, 1);

    const nameOnly = await equipmentItemService.updateEquipmentItem(ownedId, { name: `${marker}_NAME`, is_active: false });
    assert.equal(nameOnly.description, changedDescription, 'omitted description must be preserved when changing name');
    const statusOnly = await equipmentItemService.updateEquipmentItem(ownedId, { name: `${marker}_NAME`, is_active: true });
    assert.equal(statusOnly.description, changedDescription, 'omitted description must be preserved when changing status');

    const boundary = 'x'.repeat(500);
    assert.equal((await equipmentItemService.updateEquipmentItem(ownedId, { name: `${marker}_NAME`, description: boundary, is_active: true })).description.length, 500);
    await assert.rejects(
      equipmentItemService.updateEquipmentItem(ownedId, { name: `${marker}_NAME`, description: 'x'.repeat(501), is_active: true }),
      { statusCode: 400 },
    );

    const cleared = await equipmentItemService.updateEquipmentItem(ownedId, { name: `${marker}_NAME`, description: '', is_active: true });
    assert.equal(cleared.description, null);
    assert.equal((await equipmentItemService.getEquipmentItemById(ownedId)).description, null);

    assert.equal(await equipmentItemService.deleteEquipmentItem(ownedId), ownedId);
    ownedId = null;
    assert.equal(await equipmentItemService.getEquipmentItemById(created.id), null);
    assert.equal(await equipmentItemDao.deleteById(created.id), null);
  } finally {
    if (ownedId !== null) {
      const pool = await getPool();
      await pool.request().input('id', sql.Int, ownedId).query(`
        DELETE FROM dbo.equipment_items
        WHERE id = @id AND name LIKE N'IT_DESCRIPTION[_]%'
      `);
    }
    if (connected) await sql.close();
  }
});
