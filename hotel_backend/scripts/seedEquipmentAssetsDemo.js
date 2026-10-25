// Safe, idempotent demo asset seed. Read-only by default; pass --apply to insert.
// This script never creates room assignments and never updates/deletes existing rows.
const database = require('../src/config/db');

const EXPECTED_SERVER = 'LAPTOP-FF5K1DE4';
const EXPECTED_DATABASE = 'hotel_management';

const demoRows = [
  ['DEMO-EQAS-001', 'DEMO-SERIAL-001', 'Điều hòa', 'AVAILABLE'],
  ['DEMO-EQAS-002', 'DEMO-SERIAL-002', 'Tivi', 'AVAILABLE'],
  ['DEMO-EQAS-003', 'DEMO-SERIAL-003', 'Ấm đun nước', 'MAINTENANCE'],
  ['DEMO-EQAS-004', 'DEMO-SERIAL-004', 'Máy sấy tóc', 'RETIRED'],
  ['DEMO-EQAS-005', 'DEMO-SERIAL-005', 'Tủ lạnh mini', 'AVAILABLE'],
  ['DEMO-EQAS-006', 'DEMO-SERIAL-006', 'Két sắt', 'MAINTENANCE'],
  ['DEMO-EQAS-007', 'DEMO-SERIAL-007', 'Điều hòa', 'RETIRED'],
  ['DEMO-EQAS-008', 'DEMO-SERIAL-008', 'Tivi', 'MAINTENANCE'],
  ['DEMO-EQAS-009', 'DEMO-SERIAL-009', 'Ấm đun nước', 'AVAILABLE'],
  ['DEMO-EQAS-010', 'DEMO-SERIAL-010', 'Máy sấy tóc', 'AVAILABLE'],
  ['DEMO-EQAS-011', 'DEMO-SERIAL-011', 'Tủ lạnh mini', 'RETIRED'],
  ['DEMO-EQAS-012', 'DEMO-SERIAL-012', 'Két sắt', 'MAINTENANCE'],
];

function assertTarget(identity) {
  if (identity.server_name !== EXPECTED_SERVER || identity.database_name !== EXPECTED_DATABASE) {
    throw new Error(`Refusing to run: connected to ${identity.server_name}/${identity.database_name}; expected ${EXPECTED_SERVER}/${EXPECTED_DATABASE}.`);
  }
}

async function readIdentity(executor) {
  const result = await new database.sql.Request(executor).query(
    'SELECT @@SERVERNAME AS server_name, DB_NAME() AS database_name;',
  );
  const identity = result.recordset[0];
  assertTarget(identity);
  return identity;
}

async function assertSchema(pool) {
  const result = await pool.request().query(`
    SELECT t.name AS table_name, c.name AS column_name, ty.name AS data_type,
           c.max_length, c.is_nullable
    FROM sys.tables AS t
    JOIN sys.schemas AS s ON s.schema_id = t.schema_id
    JOIN sys.columns AS c ON c.object_id = t.object_id
    JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
    WHERE s.name = N'dbo'
      AND ((t.name = N'equipment_items' AND c.name IN (N'id', N'name', N'is_active'))
        OR (t.name = N'equipment_assets' AND c.name IN (N'id', N'equipment_item_id', N'asset_code', N'serial_number', N'status', N'purchase_date', N'notes'))
        OR (t.name = N'room_equipment_assignments' AND c.name IN (N'id', N'room_id', N'equipment_asset_id', N'unassigned_at'))
        OR (t.name = N'rooms' AND c.name IN (N'id', N'room_number', N'status')));
    SELECT t.name AS table_name, i.name AS index_name, i.is_unique, i.has_filter,
           i.filter_definition, c.name AS column_name
    FROM sys.tables AS t
    JOIN sys.schemas AS s ON s.schema_id = t.schema_id
    JOIN sys.indexes AS i ON i.object_id = t.object_id
    JOIN sys.index_columns AS ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
    JOIN sys.columns AS c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE s.name = N'dbo' AND t.name IN (N'equipment_assets', N'room_equipment_assignments')
      AND i.is_hypothetical = 0;
    SELECT fk.name AS fk_name, pt.name AS parent_table, pc.name AS parent_column,
           rt.name AS referenced_table, rc.name AS referenced_column, fk.delete_referential_action_desc
    FROM sys.foreign_keys AS fk
    JOIN sys.foreign_key_columns AS fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.tables AS pt ON pt.object_id = fkc.parent_object_id
    JOIN sys.columns AS pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
    JOIN sys.tables AS rt ON rt.object_id = fkc.referenced_object_id
    JOIN sys.columns AS rc ON rc.object_id = rt.object_id AND rc.column_id = fkc.referenced_column_id
    JOIN sys.schemas AS s ON s.schema_id = pt.schema_id
    WHERE s.name = N'dbo' AND pt.name IN (N'equipment_assets', N'room_equipment_assignments');
    SELECT name, definition FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.equipment_assets');
  `);

  const columnRows = result.recordsets[0] || [];
  const indexRows = result.recordsets[1] || [];
  const foreignKeys = result.recordsets[2] || [];
  const checks = result.recordsets[3] || [];
  const requiredColumns = [
    'equipment_items.id', 'equipment_items.name', 'equipment_items.is_active',
    'equipment_assets.id', 'equipment_assets.equipment_item_id', 'equipment_assets.asset_code',
    'equipment_assets.serial_number', 'equipment_assets.status', 'equipment_assets.purchase_date', 'equipment_assets.notes',
    'room_equipment_assignments.id', 'room_equipment_assignments.room_id',
    'room_equipment_assignments.equipment_asset_id', 'room_equipment_assignments.unassigned_at',
    'rooms.id', 'rooms.room_number', 'rooms.status',
  ];
  const foundColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = requiredColumns.filter((column) => !foundColumns.has(column));
  if (missingColumns.length) throw new Error(`Required schema columns are missing: ${missingColumns.join(', ')}.`);

  const hasUniqueIndex = (table, column) => indexRows.some((row) => row.table_name === table && row.column_name === column && row.is_unique);
  if (!hasUniqueIndex('equipment_assets', 'asset_code') || !hasUniqueIndex('equipment_assets', 'serial_number')) {
    throw new Error('Expected unique indexes on equipment_assets.asset_code and equipment_assets.serial_number were not found.');
  }
  if (!indexRows.some((row) => row.table_name === 'room_equipment_assignments' && row.column_name === 'equipment_asset_id' && row.is_unique && row.has_filter && /unassigned_at.*IS NULL/i.test(row.filter_definition || ''))) {
    throw new Error('Expected unique filtered index for current room assignments was not found.');
  }
  if (!foreignKeys.some((row) => row.fk_name === 'FK_equipment_assets_item' && row.parent_column === 'equipment_item_id' && row.referenced_table === 'equipment_items' && row.delete_referential_action_desc === 'NO_ACTION')) {
    throw new Error('Expected equipment_assets to equipment_items NO_ACTION foreign key was not found.');
  }
  const statusCheck = checks.find((row) => row.name === 'CK_equipment_assets_status');
  if (!statusCheck || !['AVAILABLE', 'MAINTENANCE', 'RETIRED'].every((status) => statusCheck.definition.includes(status))) {
    throw new Error('The database status constraint does not match the three Equipment Asset statuses.');
  }
  return { columnRows, indexRows, foreignKeys, checks };
}

function bindEquipmentNames(request) {
  const names = [...new Set(demoRows.map((row) => row[2]))];
  names.forEach((name, index) => request.input(`typeName${index}`, database.sql.NVarChar(100), name));
  return names;
}

async function readReferenceData(executor) {
  const request = new database.sql.Request(executor);
  const names = bindEquipmentNames(request);
  const nameParams = names.map((_, index) => `@typeName${index}`).join(', ');
  const result = await request.query(`
    SELECT id, name, is_active FROM dbo.equipment_items WHERE name IN (${nameParams});
    SELECT id, room_number, status FROM dbo.rooms ORDER BY id;
    SELECT item.id AS equipment_item_id, item.name, COUNT(asset.id) AS total_assets
    FROM dbo.equipment_items AS item LEFT JOIN dbo.equipment_assets AS asset ON asset.equipment_item_id = item.id
    GROUP BY item.id, item.name ORDER BY item.id;
  `);
  const types = result.recordsets[0] || [];
  const rooms = result.recordsets[1] || [];
  const counts = result.recordsets[2] || [];
  const byName = new Map(types.map((type) => [type.name, type]));
  const missing = names.filter((name) => !byName.has(name));
  const inactive = names.filter((name) => byName.has(name) && !byName.get(name).is_active);
  if (missing.length || inactive.length) {
    throw new Error(`Seed equipment types must exist and be active. Missing: ${missing.join(', ') || 'none'}; inactive: ${inactive.join(', ') || 'none'}.`);
  }
  if (rooms.length === 0) throw new Error('No real room rows were found; refusing to seed without verifying room data.');
  return { types: byName, rooms, existingCounts: counts };
}

async function findCollision(executor, assetCode, serialNumber) {
  return new database.sql.Request(executor)
    .input('assetCode', database.sql.VarChar(50), assetCode)
    .input('serialNumber', database.sql.VarChar(100), serialNumber)
    .query(`
      SELECT id, equipment_item_id, asset_code, serial_number, status
      FROM dbo.equipment_assets WITH (UPDLOCK, HOLDLOCK)
      WHERE asset_code = @assetCode OR serial_number = @serialNumber;
    `);
}

async function readDemoSummary(executor) {
  return new database.sql.Request(executor).query(`
    SELECT asset.id, asset.asset_code, asset.serial_number, item.id AS equipment_item_id,
           item.name AS equipment_type, asset.status, room.room_number AS assigned_room,
           room.status AS room_status
    FROM dbo.equipment_assets AS asset
    JOIN dbo.equipment_items AS item ON item.id = asset.equipment_item_id
    LEFT JOIN dbo.room_equipment_assignments AS assignment
      ON assignment.equipment_asset_id = asset.id AND assignment.unassigned_at IS NULL
    LEFT JOIN dbo.rooms AS room ON room.id = assignment.room_id
    WHERE asset.asset_code LIKE 'DEMO%'
    ORDER BY asset.asset_code;
    SELECT item.id AS equipment_item_id, item.name, COUNT(asset.id) AS total_assets
    FROM dbo.equipment_items AS item LEFT JOIN dbo.equipment_assets AS asset ON asset.equipment_item_id = item.id
    GROUP BY item.id, item.name ORDER BY item.id;
    SELECT COUNT(*) AS demo_current_assignments
    FROM dbo.room_equipment_assignments AS assignment
    JOIN dbo.equipment_assets AS asset ON asset.id = assignment.equipment_asset_id
    WHERE asset.asset_code LIKE 'DEMO%' AND assignment.unassigned_at IS NULL;
  `);
}

async function run() {
  const apply = process.argv.includes('--apply');
  const pool = await database.getPool();
  let transaction;
  let transactionStarted = false;
  try {
    const identity = await readIdentity(pool);
    const schema = await assertSchema(pool);
    const { types, rooms, existingCounts } = await readReferenceData(pool);
    const initialDemo = await pool.request().query("SELECT COUNT(*) AS demo_count FROM dbo.equipment_assets WHERE asset_code LIKE 'DEMO%';");
    const output = {
      mode: apply ? 'apply' : 'check-only',
      target: identity,
      equipmentTypes: [...types.values()].map(({ id, name, is_active }) => ({ id, name, is_active })),
      realRoomCount: rooms.length,
      roomIdsVerified: rooms.map((room) => room.id),
      currentDemoAssetCount: initialDemo.recordset[0].demo_count,
      plannedAssetCount: demoRows.length,
      plannedStatusCounts: demoRows.reduce((counts, row) => ({ ...counts, [row[3]]: (counts[row[3]] || 0) + 1 }), {}),
      currentAssignmentsWillBeCreated: 0,
      equipmentTypeAssetCountsBefore: existingCounts,
      verifiedConstraintCount: schema.foreignKeys.length + schema.checks.length,
    };

    if (!apply) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    transaction = new database.sql.Transaction(pool);
    await transaction.begin(database.sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;
    assertTarget(await readIdentity(transaction));
    const transactionalTypes = await readReferenceData(transaction);
    let inserted = 0;
    let skipped = 0;
    const insertedIds = [];
    for (const [assetCode, serialNumber, equipmentTypeName, status] of demoRows) {
      const collision = await findCollision(transaction, assetCode, serialNumber);
      if (collision.recordset.length) {
        skipped += 1;
        continue;
      }
      const equipmentType = transactionalTypes.types.get(equipmentTypeName);
      const result = await new database.sql.Request(transaction)
        .input('equipmentItemId', database.sql.Int, equipmentType.id)
        .input('assetCode', database.sql.VarChar(50), assetCode)
        .input('serialNumber', database.sql.VarChar(100), serialNumber)
        .input('status', database.sql.VarChar(20), status)
        .input('notes', database.sql.NVarChar(500), 'DEMO sample data for Equipment Asset UI verification; not operational inventory.')
        .query(`
          INSERT INTO dbo.equipment_assets (equipment_item_id, asset_code, serial_number, status, purchase_date, notes)
          OUTPUT INSERTED.id, INSERTED.asset_code
          VALUES (@equipmentItemId, @assetCode, @serialNumber, @status, NULL, @notes);
        `);
      inserted += 1;
      insertedIds.push(result.recordset[0]);
    }
    const transactionalSummary = await readDemoSummary(transaction);
    const retiredAssignedBeforeCommit = (transactionalSummary.recordsets[0] || [])
      .filter((asset) => asset.status === 'RETIRED' && asset.assigned_room !== null);
    if (retiredAssignedBeforeCommit.length) {
      throw new Error('Pre-commit verification found a Retired demo asset assigned to a room.');
    }
    await transaction.commit();
    transactionStarted = false;

    const summary = await readDemoSummary(pool);
    const assets = summary.recordsets[0] || [];
    const retiredAssigned = assets.filter((asset) => asset.status === 'RETIRED' && asset.assigned_room !== null);
    output.insertedCount = inserted;
    output.skippedExistingCount = skipped;
    output.insertedIds = insertedIds;
    output.demoAssetsAfter = assets;
    output.equipmentTypeAssetCountsAfter = summary.recordsets[1] || [];
    output.demoCurrentAssignmentCount = summary.recordsets[2]?.[0]?.demo_current_assignments ?? null;
    output.retiredAssetsAssignedToRoom = retiredAssigned.length;
    output.transactionalRetiredAssetsAssignedToRoom = retiredAssignedBeforeCommit.length;
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    if (transactionStarted) await transaction.rollback().catch(() => {});
    throw error;
  }
}

run()
  .catch((error) => {
    console.error('Equipment Asset demo seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => database.sql.close().catch(() => {}));
