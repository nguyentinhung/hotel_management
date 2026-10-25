SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.equipment_items', N'U') IS NULL
    THROW 51000, 'dbo.equipment_items does not exist; equipment description migration was not applied.', 1;

  IF COL_LENGTH(N'dbo.equipment_items', N'description') IS NULL
  BEGIN
    ALTER TABLE dbo.equipment_items
      ADD description NVARCHAR(500) NULL;
  END
  ELSE IF NOT EXISTS (
    SELECT 1
    FROM sys.columns c
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.equipment_items')
      AND c.name = N'description'
      AND t.name = N'nvarchar'
      AND c.max_length = 1000
      AND c.is_nullable = 1
  )
  BEGIN
    THROW 51001, 'dbo.equipment_items.description already exists with an unexpected type, length, or nullability.', 1;
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
