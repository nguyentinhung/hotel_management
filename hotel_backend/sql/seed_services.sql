/* Sample hotel services for local development. Prices are illustrative VND values. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO dbo.services (name, description, price, unit, is_active)
SELECT v.name, v.description, v.price, v.unit, 1
FROM (VALUES
  (N'Ăn sáng buffet', N'Bữa sáng buffet tại nhà hàng của khách sạn.', CAST(150000 AS DECIMAL(10,2)), N'người/lần'),
  (N'Giặt ủi', N'Dịch vụ giặt và ủi quần áo.', CAST(50000 AS DECIMAL(10,2)), N'kg'),
  (N'Đưa đón sân bay', N'Dịch vụ đưa đón sân bay theo chuyến.', CAST(350000 AS DECIMAL(10,2)), N'chuyến'),
  (N'Giường phụ', N'Bố trí thêm một giường trong phòng.', CAST(300000 AS DECIMAL(10,2)), N'đêm'),
  (N'Dịch vụ spa', N'Dịch vụ chăm sóc và thư giãn tại spa.', CAST(400000 AS DECIMAL(10,2)), N'lần')
) AS v(name, description, price, unit)
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.services AS existing WHERE existing.name = v.name
);

COMMIT TRANSACTION;

SELECT id, name, description, price, unit, is_active, is_deleted
FROM dbo.services
WHERE is_deleted = 0
ORDER BY id;
