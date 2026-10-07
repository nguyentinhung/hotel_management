const sql = require('mssql');

const config = {
  user: 'sa',
  password: '123',
  server: 'localhost',
  database: 'hotel_management',
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

async function ensureAuthTables() {
  const currentPool = await getPool();

  await currentPool.request().query(`
    IF OBJECT_ID(N'dbo.email_verifications', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.email_verifications (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        user_id BIGINT NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        type VARCHAR(30) NOT NULL DEFAULT 'email_verification',
        expires_at DATETIMEOFFSET NOT NULL,
        used_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_email_verifications_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
      );
    END;
  `);

  await currentPool.request().query(`
    IF OBJECT_ID(N'dbo.refresh_tokens', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.refresh_tokens (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        user_id BIGINT NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIMEOFFSET NOT NULL,
        revoked_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_refresh_tokens_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
      );
    END;
  `);

  await currentPool.request().query(`
    IF OBJECT_ID(N'dbo.password_resets', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.password_resets (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        user_id BIGINT NOT NULL,
        otp_code VARCHAR(10) NULL,
        token VARCHAR(255) NULL,
        expires_at DATETIME2 NOT NULL,
        is_used BIT NOT NULL CONSTRAINT DF_password_resets_is_used DEFAULT (0),
        created_at DATETIME2 NOT NULL CONSTRAINT DF_password_resets_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_password_resets_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
      );
    END;
  `);

  await currentPool.request().query(`
    IF EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'CUSTOMER' AND id <> 1)
       OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'RECEPTIONIST' AND id <> 2)
       OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'HOUSEKEEPER' AND id <> 3)
       OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'ADMIN' AND id <> 4)
      THROW 50003, 'Built-in role IDs must be CUSTOMER=1, RECEPTIONIST=2, HOUSEKEEPER=3, ADMIN=4.', 1;
    IF EXISTS (SELECT 1 FROM dbo.roles WHERE id BETWEEN 1 AND 4 AND code NOT IN ('CUSTOMER','RECEPTIONIST','HOUSEKEEPER','ADMIN'))
      THROW 50004, 'Role IDs 1-4 are reserved for built-in roles.', 1;

    SET IDENTITY_INSERT dbo.roles ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'CUSTOMER')
      INSERT INTO dbo.roles (id, code, name) VALUES (1, 'CUSTOMER', N'Khách hàng');
    IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'RECEPTIONIST')
      INSERT INTO dbo.roles (id, code, name) VALUES (2, 'RECEPTIONIST', N'Lễ tân');
    IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'HOUSEKEEPER')
      INSERT INTO dbo.roles (id, code, name) VALUES (3, 'HOUSEKEEPER', N'Buồng phòng');
    IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'ADMIN')
      INSERT INTO dbo.roles (id, code, name) VALUES (4, 'ADMIN', N'Quản trị viên');
    SET IDENTITY_INSERT dbo.roles OFF;
    DECLARE @roleIdentitySeed INT = ISNULL((SELECT MAX(id) FROM dbo.roles), 0);
    DBCC CHECKIDENT ('dbo.roles', RESEED, @roleIdentitySeed);
  `);
}

module.exports = {
  sql,
  getPool,
  ensureAuthTables,
};
