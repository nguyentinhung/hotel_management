/* Manual equivalent of the idempotent migration run by backend bootstrap. */
IF COL_LENGTH('dbo.bookings', 'original_total_amount') IS NULL
  ALTER TABLE dbo.bookings ADD original_total_amount DECIMAL(12, 2) NULL;
GO
IF COL_LENGTH('dbo.bookings', 'discount_amount') IS NULL
  ALTER TABLE dbo.bookings ADD discount_amount DECIMAL(12, 2) NOT NULL
    CONSTRAINT DF_bookings_discount_amount DEFAULT (0) WITH VALUES;
GO
IF COL_LENGTH('dbo.bookings', 'promotion_id') IS NULL
  ALTER TABLE dbo.bookings ADD promotion_id INT NULL;
GO
IF COL_LENGTH('dbo.bookings', 'promotion_code') IS NULL
  ALTER TABLE dbo.bookings ADD promotion_code VARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.bookings', 'promotion_discount_type') IS NULL
  ALTER TABLE dbo.bookings ADD promotion_discount_type VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.bookings', 'promotion_discount_value') IS NULL
  ALTER TABLE dbo.bookings ADD promotion_discount_value DECIMAL(12, 2) NULL;
GO
IF COL_LENGTH('dbo.bookings', 'promotion_max_discount') IS NULL
  ALTER TABLE dbo.bookings ADD promotion_max_discount DECIMAL(12, 2) NULL;
GO
UPDATE dbo.bookings
SET original_total_amount = total_amount
WHERE original_total_amount IS NULL;
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_bookings_promotions')
  ALTER TABLE dbo.bookings DROP CONSTRAINT FK_bookings_promotions;
GO
