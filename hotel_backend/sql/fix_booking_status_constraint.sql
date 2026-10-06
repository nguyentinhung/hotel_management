USE [hotel_management];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @allowedStatuses nvarchar(max);
DECLARE @sql nvarchar(max);

-- Preserve every status already present in this database, while also allowing
-- the statuses currently used by the application.
SELECT @allowedStatuses = STRING_AGG(QUOTENAME([status], ''''), N',')
FROM (
  SELECT DISTINCT [status]
  FROM dbo.bookings
  WHERE [status] IS NOT NULL

  UNION
  SELECT N'PENDING_PAYMENT'
  UNION
  SELECT N'CONFIRMED'
  UNION
  SELECT N'CHECKED_IN'
  UNION
  SELECT N'CHECKED_OUT'
  UNION
  SELECT N'CANCELLED'
) AS statuses;

IF EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.bookings')
    AND name = N'chk_booking_status'
)
BEGIN
  ALTER TABLE dbo.bookings DROP CONSTRAINT chk_booking_status;
END;

SET @sql = N'
  ALTER TABLE dbo.bookings WITH CHECK
  ADD CONSTRAINT chk_booking_status
  CHECK ([status] IN (' + @allowedStatuses + N'));

  ALTER TABLE dbo.bookings CHECK CONSTRAINT chk_booking_status;
';

EXEC sys.sp_executesql @sql;
COMMIT TRANSACTION;
GO
