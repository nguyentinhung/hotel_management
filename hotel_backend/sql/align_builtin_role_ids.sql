/*
  Standardize built-in role IDs expected throughout the application:
  CUSTOMER=1, RECEPTIONIST=2, HOUSEKEEPER=3, ADMIN=4.
  Existing users are remapped in the same transaction.
  Safe to rerun after the mapping is in place.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF (SELECT COUNT(*) FROM dbo.roles WHERE code IN ('CUSTOMER','RECEPTIONIST','HOUSEKEEPER','ADMIN')) <> 4
BEGIN
  THROW 50020, 'Expected all four built-in roles before aligning role IDs.', 1;
END;

IF EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'CUSTOMER' AND id <> 1)
   OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'RECEPTIONIST' AND id <> 2)
   OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'HOUSEKEEPER' AND id <> 3)
   OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'ADMIN' AND id <> 4)
BEGIN
  IF EXISTS (SELECT 1 FROM dbo.roles WHERE id BETWEEN 1 AND 4)
  BEGIN
    THROW 50021, 'Role IDs 1-4 are occupied; resolve the conflict before aligning built-in roles.', 1;
  END;

  UPDATE dbo.roles
    SET code = CONCAT('LEGACY_', code)
    WHERE code IN ('CUSTOMER','RECEPTIONIST','HOUSEKEEPER','ADMIN');

  SET IDENTITY_INSERT dbo.roles ON;
  INSERT INTO dbo.roles (id, code, name) VALUES
    (1, 'CUSTOMER', N'Khách hàng'),
    (2, 'RECEPTIONIST', N'Lễ tân'),
    (3, 'HOUSEKEEPER', N'Buồng phòng'),
    (4, 'ADMIN', N'Quản trị viên');
  SET IDENTITY_INSERT dbo.roles OFF;

  UPDATE u
    SET role_id = newRole.id
  FROM dbo.users u
  JOIN dbo.roles oldRole
    ON oldRole.id = u.role_id
   AND oldRole.code IN ('LEGACY_CUSTOMER','LEGACY_RECEPTIONIST','LEGACY_HOUSEKEEPER','LEGACY_ADMIN')
  JOIN dbo.roles newRole
    ON newRole.code = SUBSTRING(oldRole.code, 8, 20);

  DELETE FROM dbo.roles
  WHERE code IN ('LEGACY_CUSTOMER','LEGACY_RECEPTIONIST','LEGACY_HOUSEKEEPER','LEGACY_ADMIN');
END;

DECLARE @roleIdentitySeed INT = ISNULL((SELECT MAX(id) FROM dbo.roles), 0);
DBCC CHECKIDENT ('dbo.roles', RESEED, @roleIdentitySeed);

COMMIT TRANSACTION;

SELECT id, code, name FROM dbo.roles ORDER BY id;
