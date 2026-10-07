/*
  Adds the soft-delete flag expected by the services API.
  Safe to run more than once; existing services remain visible (is_deleted = 0).
*/
IF OBJECT_ID(N'dbo.services', N'U') IS NULL
BEGIN
  THROW 50001, 'Table dbo.services was not found in the current database. Check the selected database.', 1;
END;
GO

IF COL_LENGTH(N'dbo.services', N'is_deleted') IS NULL
BEGIN
  ALTER TABLE dbo.services
    ADD is_deleted BIT NOT NULL
      CONSTRAINT DF_services_is_deleted DEFAULT (0) WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.services', N'is_deleted') IS NULL
BEGIN
  THROW 50002, 'Could not add dbo.services.is_deleted.', 1;
END;
GO
