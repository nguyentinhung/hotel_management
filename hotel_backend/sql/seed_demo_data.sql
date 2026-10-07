/*
  Idempotent local-development data for the hotel management application.
  All names, contacts, bookings, payments, and prices below are fictional.
  Demo account password for all four accounts: 123456
  Re-running this script does not duplicate records with the same natural keys.
*/
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.services', N'U') IS NULL
  THROW 50001, 'dbo.services is missing. Apply the database migrations first.', 1;
IF COL_LENGTH(N'dbo.services', N'is_deleted') IS NULL
  THROW 50002, 'dbo.services.is_deleted is missing. Apply sql/add_services_is_deleted.sql first.', 1;

BEGIN TRANSACTION;

/* Built-in role IDs are fixed to match the application's role checks. */
IF EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'CUSTOMER' AND id <> 1)
   OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'RECEPTIONIST' AND id <> 2)
   OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'HOUSEKEEPER' AND id <> 3)
   OR EXISTS (SELECT 1 FROM dbo.roles WHERE code = 'ADMIN' AND id <> 4)
  THROW 50010, 'Built-in role IDs must be CUSTOMER=1, RECEPTIONIST=2, HOUSEKEEPER=3, ADMIN=4.', 1;
IF EXISTS (SELECT 1 FROM dbo.roles WHERE id BETWEEN 1 AND 4 AND code NOT IN ('CUSTOMER','RECEPTIONIST','HOUSEKEEPER','ADMIN'))
  THROW 50011, 'Role IDs 1-4 are reserved for built-in roles.', 1;

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
INSERT INTO dbo.users (role_id, email, password_hash, full_name, phone, status)
SELECT r.id, v.email, '$2b$10$CBFbmL6VW/0vslp5oYUTFOz4.NrRMa9dk1RK.kqRptodqrGVw/pby', v.full_name, v.phone, 'ACTIVE'
FROM (VALUES
  ('admin.demo@example.test', N'Tài khoản quản trị mẫu', '0900000001', 'ADMIN'),
  ('reception.demo@example.test', N'Tài khoản lễ tân mẫu', '0900000002', 'RECEPTIONIST'),
  ('housekeeping.demo@example.test', N'Tài khoản buồng phòng mẫu', '0900000003', 'HOUSEKEEPER'),
  ('customer.demo@example.test', N'Tài khoản khách hàng mẫu', '0900000004', 'CUSTOMER')
) AS v(email, full_name, phone, role_code)
JOIN dbo.roles r ON r.code = v.role_code
WHERE NOT EXISTS (SELECT 1 FROM dbo.users u WHERE u.email = v.email);

INSERT INTO dbo.amenities (name)
SELECT v.name
FROM (VALUES (N'Wi-Fi miễn phí'), (N'Điều hòa'), (N'Tivi'), (N'Mini bar'), (N'Bồn tắm'), (N'Két an toàn')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM dbo.amenities a WHERE a.name = v.name);

INSERT INTO dbo.room_types (name, description, base_price, max_adults, max_children)
SELECT v.name, v.description, v.base_price, v.max_adults, v.max_children
FROM (VALUES
  (N'Phòng tiêu chuẩn', N'Phòng nghỉ tiện nghi dành cho khách cá nhân hoặc cặp đôi.', CAST(900000 AS DECIMAL(10,2)), 2, 1),
  (N'Phòng Deluxe', N'Phòng rộng với khu vực nghỉ ngơi thoải mái.', CAST(1200000 AS DECIMAL(10,2)), 2, 2),
  (N'Phòng gia đình', N'Phòng rộng phù hợp cho gia đình nhỏ.', CAST(1800000 AS DECIMAL(10,2)), 3, 2)
) AS v(name, description, base_price, max_adults, max_children)
WHERE NOT EXISTS (SELECT 1 FROM dbo.room_types rt WHERE rt.name = v.name);

INSERT INTO dbo.rooms (room_number, room_type_id, floor, status)
SELECT v.room_number, rt.id, v.floor, 'AVAILABLE'
FROM (VALUES
  ('101', N'Phòng tiêu chuẩn', 1), ('102', N'Phòng tiêu chuẩn', 1),
  ('201', N'Phòng Deluxe', 2), ('202', N'Phòng Deluxe', 2),
  ('301', N'Phòng gia đình', 3), ('302', N'Phòng gia đình', 3)
) AS v(room_number, room_type_name, floor)
JOIN dbo.room_types rt ON rt.name = v.room_type_name
WHERE NOT EXISTS (SELECT 1 FROM dbo.rooms r WHERE r.room_number = v.room_number);

INSERT INTO dbo.room_type_amenities (room_type_id, amenity_id)
SELECT rt.id, a.id
FROM dbo.room_types rt
CROSS JOIN dbo.amenities a
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.room_type_amenities x WHERE x.room_type_id = rt.id AND x.amenity_id = a.id
);

INSERT INTO dbo.room_type_images (room_type_id, image_url, is_primary)
SELECT rt.id, v.image_url, 1
FROM (VALUES
  (N'Phòng tiêu chuẩn', 'https://placehold.co/1200x800?text=Standard+Room'),
  (N'Phòng Deluxe', 'https://placehold.co/1200x800?text=Deluxe+Room'),
  (N'Phòng gia đình', 'https://placehold.co/1200x800?text=Family+Room')
) AS v(room_type_name, image_url)
JOIN dbo.room_types rt ON rt.name = v.room_type_name
WHERE NOT EXISTS (SELECT 1 FROM dbo.room_type_images i WHERE i.room_type_id = rt.id AND i.image_url = v.image_url);

INSERT INTO dbo.services (name, description, price, unit, is_active)
SELECT v.name, v.description, v.price, v.unit, 1
FROM (VALUES
  (N'Ăn sáng buffet', N'Bữa sáng buffet tại nhà hàng của khách sạn.', CAST(150000 AS DECIMAL(10,2)), N'người/lần'),
  (N'Giặt ủi', N'Dịch vụ giặt và ủi quần áo.', CAST(50000 AS DECIMAL(10,2)), N'kg'),
  (N'Đưa đón sân bay', N'Dịch vụ đưa đón sân bay theo chuyến.', CAST(350000 AS DECIMAL(10,2)), N'chuyến'),
  (N'Giường phụ', N'Bố trí thêm một giường trong phòng.', CAST(300000 AS DECIMAL(10,2)), N'đêm'),
  (N'Dịch vụ spa', N'Dịch vụ chăm sóc và thư giãn tại spa.', CAST(400000 AS DECIMAL(10,2)), N'lần')
) AS v(name, description, price, unit)
WHERE NOT EXISTS (SELECT 1 FROM dbo.services s WHERE s.name = v.name);

INSERT INTO dbo.equipment_items (name, is_active)
SELECT v.name, 1
FROM (VALUES (N'Điều hòa'), (N'Tivi'), (N'Vòi nước'), (N'Khóa cửa')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM dbo.equipment_items e WHERE e.name = v.name);

INSERT INTO dbo.promotions (code, name, description, discount_type, discount_value, max_discount, valid_from, valid_to, is_active)
SELECT 'WELCOME10', N'Ưu đãi khách mới', N'Giảm 10% giá phòng cho khách đặt lần đầu (dữ liệu mẫu).', 'PERCENT', 10, 500000,
       DATEADD(day, -30, SYSDATETIME()), DATEADD(day, 365, SYSDATETIME()), 1
WHERE NOT EXISTS (SELECT 1 FROM dbo.promotions WHERE code = 'WELCOME10');

INSERT INTO dbo.promotion_room_types (promotion_id, room_type_id)
SELECT p.id, rt.id
FROM dbo.promotions p
CROSS JOIN dbo.room_types rt
WHERE p.code = 'WELCOME10'
  AND NOT EXISTS (SELECT 1 FROM dbo.promotion_room_types x WHERE x.promotion_id = p.id AND x.room_type_id = rt.id);

INSERT INTO dbo.bookings
  (booking_code, customer_id, guest_full_name, guest_phone, guest_email, check_in_date, check_out_date, adults, children, status, total_amount, deposit_amount, special_request)
SELECT 'DEMO2026100001', u.id, N'Khách đặt phòng mẫu', '0900000004', 'customer.demo@example.test',
       DATEADD(day, -3, CONVERT(date, GETDATE())), DATEADD(day, -1, CONVERT(date, GETDATE())),
       2, 0, 'CHECKED_OUT', 2700000, 0, N'Đặt phòng mẫu để kiểm tra các màn hình quản lý.'
FROM dbo.users u
WHERE u.email = 'customer.demo@example.test'
  AND NOT EXISTS (SELECT 1 FROM dbo.bookings b WHERE b.booking_code = 'DEMO2026100001');

DECLARE @bookingId BIGINT = (SELECT id FROM dbo.bookings WHERE booking_code = 'DEMO2026100001');
DECLARE @customerId BIGINT = (SELECT id FROM dbo.users WHERE email = 'customer.demo@example.test');
DECLARE @housekeeperId BIGINT = (SELECT u.id FROM dbo.users u JOIN dbo.roles r ON r.id = u.role_id WHERE u.email = 'housekeeping.demo@example.test' AND r.code = 'HOUSEKEEPER');
DECLARE @deluxeTypeId INT = (SELECT id FROM dbo.room_types WHERE name = N'Phòng Deluxe');
DECLARE @deluxeRoomId INT = (SELECT id FROM dbo.rooms WHERE room_number = '201');
DECLARE @breakfastId INT = (SELECT id FROM dbo.services WHERE name = N'Ăn sáng buffet' AND is_deleted = 0);

IF @bookingId IS NOT NULL
BEGIN
  INSERT INTO dbo.booking_rooms (booking_id, room_type_id, room_id, price_per_night, actual_check_in, actual_check_out)
  SELECT @bookingId, @deluxeTypeId, @deluxeRoomId, 1200000,
         DATEADD(day, -3, CONVERT(datetime2, CONVERT(date, GETDATE()))),
         DATEADD(day, -1, CONVERT(datetime2, CONVERT(date, GETDATE())))
  WHERE NOT EXISTS (SELECT 1 FROM dbo.booking_rooms WHERE booking_id = @bookingId);

  INSERT INTO dbo.booking_guests (booking_id, full_name, phone, id_card_number, id_card_verified)
  SELECT @bookingId, N'Khách đặt phòng mẫu', '0900000004', 'DEMO000001', 0
  WHERE NOT EXISTS (SELECT 1 FROM dbo.booking_guests WHERE booking_id = @bookingId);
END;

DECLARE @bookingRoomId BIGINT = (SELECT TOP (1) id FROM dbo.booking_rooms WHERE booking_id = @bookingId ORDER BY id);
IF @bookingRoomId IS NOT NULL AND @breakfastId IS NOT NULL
  INSERT INTO dbo.booking_services (booking_room_id, service_id, quantity, unit_price, used_at)
  SELECT @bookingRoomId, @breakfastId, 2, 150000, DATEADD(day, -2, SYSDATETIME())
  WHERE NOT EXISTS (SELECT 1 FROM dbo.booking_services WHERE booking_room_id = @bookingRoomId AND service_id = @breakfastId);

IF @bookingId IS NOT NULL
  INSERT INTO dbo.invoices (invoice_number, booking_id, room_amount, service_amount, discount_amount, tax_amount, total_amount, deposit_paid, amount_due, status)
  SELECT 'INV-DEMO-20261001', @bookingId, 2400000, 300000, 0, 0, 2700000, 2700000, 0, 'PAID'
  WHERE NOT EXISTS (SELECT 1 FROM dbo.invoices WHERE booking_id = @bookingId);

DECLARE @invoiceId BIGINT = (SELECT id FROM dbo.invoices WHERE booking_id = @bookingId);
IF @invoiceId IS NOT NULL
BEGIN
  INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
  SELECT @invoiceId, 'ROOM', N'Phòng Deluxe (2 đêm)', 2, 1200000, 2400000
  WHERE NOT EXISTS (SELECT 1 FROM dbo.invoice_items WHERE invoice_id = @invoiceId AND item_type = 'ROOM');

  INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
  SELECT @invoiceId, 'SERVICE', N'Ăn sáng buffet', 2, 150000, 300000
  WHERE NOT EXISTS (SELECT 1 FROM dbo.invoice_items WHERE invoice_id = @invoiceId AND item_type = 'SERVICE');

  INSERT INTO dbo.payments (payment_code, booking_id, invoice_id, amount, payment_type, method, status, paid_at)
  SELECT 'PAY-DEMO-20261001', @bookingId, @invoiceId, 2700000, 'FINAL', 'CASH', 'SUCCESS', SYSDATETIME()
  WHERE NOT EXISTS (SELECT 1 FROM dbo.payments WHERE payment_code = 'PAY-DEMO-20261001');
END;

IF @bookingId IS NOT NULL AND @customerId IS NOT NULL AND @deluxeTypeId IS NOT NULL
  INSERT INTO dbo.reviews (booking_id, customer_id, room_type_id, rating, comment, is_hidden)
  SELECT @bookingId, @customerId, @deluxeTypeId, 5, N'Phòng sạch sẽ, nhân viên thân thiện. (Đánh giá mẫu)', 0
  WHERE NOT EXISTS (SELECT 1 FROM dbo.reviews WHERE booking_id = @bookingId);

IF @housekeeperId IS NOT NULL AND @deluxeRoomId IS NOT NULL
BEGIN
  INSERT INTO dbo.cleaning_tasks (room_id, assigned_to, priority, status, special_instructions)
  SELECT @deluxeRoomId, @housekeeperId, 'MEDIUM', 'NOT_STARTED', N'Kiểm tra phòng mẫu sau khi khách trả phòng.'
  WHERE NOT EXISTS (SELECT 1 FROM dbo.cleaning_tasks WHERE room_id = @deluxeRoomId);

  INSERT INTO dbo.room_problem_reports (room_id, reported_by, equipment_item_id, title, description, status, resolved_at)
  SELECT @deluxeRoomId, @housekeeperId, e.id, N'Báo lỗi thiết bị mẫu', N'Kiểm tra điều hòa trong phòng.', 'RESOLVED', SYSUTCDATETIME()
  FROM dbo.equipment_items e
  WHERE e.name = N'Điều hòa'
    AND NOT EXISTS (SELECT 1 FROM dbo.room_problem_reports WHERE room_id = @deluxeRoomId AND title = N'Báo lỗi thiết bị mẫu');
END;

IF @customerId IS NOT NULL
BEGIN
  INSERT INTO dbo.notifications (user_id, notification_type, title, content, is_read)
  SELECT @customerId, 'SYSTEM', N'Chào mừng bạn', N'Tài khoản khách hàng mẫu đã sẵn sàng.', 0
  WHERE NOT EXISTS (SELECT 1 FROM dbo.notifications WHERE user_id = @customerId AND title = N'Chào mừng bạn');

  INSERT INTO dbo.support_tickets (user_id, title, content, status)
  SELECT @customerId, N'Yêu cầu hỗ trợ mẫu', N'Đây là yêu cầu mẫu để kiểm tra màn hình hỗ trợ.', 'NEW'
  WHERE NOT EXISTS (SELECT 1 FROM dbo.support_tickets WHERE user_id = @customerId AND title = N'Yêu cầu hỗ trợ mẫu');
END;

COMMIT TRANSACTION;

SELECT t.name AS table_name, SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.is_ms_shipped = 0
GROUP BY t.name
ORDER BY t.name;
