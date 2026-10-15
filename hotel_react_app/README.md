# Hotel Lumière - Trang chủ khách sạn

## Cách chạy

### 1) Backend SQL Server

```bash
cd hotel_backend
npm install
npm run dev
```

Backend chạy ở:
- http://localhost:5000/api/health

### 2) Frontend React

```bash
cd hotel_react_app
npm install
npm run dev -- --host 0.0.0.0
```

Frontend chạy ở:
- http://localhost:5173/

## Bảng mapping giao diện với database SQL Server

| Phần giao diện | Bảng database | Ghi chú |
|---|---|---|
| Phòng | `room_types` | Lấy `id`, `name`, `description`, `base_price`, `max_adults`, `max_children` |
| Ảnh phòng | `room_type_images` | Lấy `image_url` với `is_primary = 1` |
| Tiện nghi | `amenities` + `room_type_amenities` | Gom thành mảng `amenities` |
| Đánh giá | `reviews` + `users` | Lấy `rating`, `comment`, `full_name` và `room_type_id` |
| Ưu đãi | `promotions` | Chỉ hiển thị `is_active = 1` và đang trong `valid_from`..`valid_to` |
| Dịch vụ | `services` | Chỉ hiển thị `is_active = 1` |
| Form tìm phòng | `bookings` + `room_types` | Frontend lọc theo sức chứa; kiểm tra phòng trống và lịch đặt do backend xử lý |

## Chuyển dữ liệu mẫu sang API thật

- Frontend đang dùng `USE_MOCK = false` trong file `src/services/homeService.ts`.
- Khi backend chạy trên `http://localhost:5000`, React sẽ gọi các endpoint:

```txt
GET /api/room-types
GET /api/promotions/active
GET /api/services?active=true
GET /api/reviews?hidden=false
```

- Nếu cần quay lại dữ liệu mẫu, đổi lại:

```ts
export const USE_MOCK = true;
```

## Backend SQL Server

- Server: `localhost`
- Port: `1433`
- Database: `hotel_management`
- User: `sa`
- Password: `123`

File backend chính:
- `hotel_backend/src/index.js`
- `hotel_backend/src/config/db.js`
- `hotel_backend/src/dao/homeDao.js`
- `hotel_backend/src/services/homeService.js`
- `hotel_backend/src/controllers/homeController.js`

## Ghi chú thiết kế

- Toàn bộ giao diện tiếng Việt.
- Responsive cho máy tính và di động.
- Không dùng thư viện UI, chỉ CSS thuần.
- Không làm phân quyền, đăng nhập thật, thanh toán hoặc booking thực tế trong phiên bản này.

## Review Management: đặc tả dữ liệu giao diện

### Cơ sở và giới hạn xác nhận

Theo bảng phân quyền được cung cấp: Guest xem review công khai; Customer tạo, xem review công khai và sửa review của mình; Receptionist xem danh sách; Housekeeper không có chức năng; Admin xem danh sách kèm trạng thái ẩn/hiện và không sửa review.

Trong workspace không tìm thấy file `hotel_management_with_default_accounts.sql` hoặc bảng phân quyền để đối chiếu. Schema `reviews` được xác nhận theo yêu cầu gồm `id, booking_id, customer_id, room_type_id, rating, comment, is_hidden`. Backend đang dùng `users.id/full_name` và `room_types.id/name`. Tên cột chính xác của `bookings`, kiểu dữ liệu, khóa ngoại, default và unique constraint cần xác minh với SQL gốc.

| Actor | Chức năng | Vị trí | Thành phần giao diện | Dữ liệu hiển thị | Bảng/cột nguồn | Điều kiện truy vấn/quyền |
|---|---|---|---|---|---|---|
| Guest | View Review List | Trang chi tiết loại phòng | Danh sách, sao, nội dung, tên người đánh giá; tên loại phòng trên trang | rating, comment, full_name, room type name | reviews, users, room_types | Lọc room_type_id và is_hidden = 0; không cần đăng nhập |
| Customer | Create Review | Form từ booking của tôi | Booking/loại phòng, chọn 1–5 sao, nhập nội dung, gửi | Booking ID, loại phòng lấy từ booking, rating/comment nhập | bookings (cột cần xác minh), room_types.id/name, reviews.* | Server lấy customer ID từ token; xác minh booking thuộc user và chưa có review; không tin customer_id/room_type_id từ client |
| Customer | View Review List | Trang chi tiết loại phòng | Như Guest, thêm điểm trung bình và tổng số review | rating, comment, full_name, average, count, room type name | reviews, users.full_name, room_types.name | Danh sách và aggregate cùng lọc room_type_id, is_hidden = 0 |
| Customer | Update Review | Form sửa review của tôi | Sao và nội dung điền sẵn, nút lưu | reviews.rating/comment | reviews.id/customer_id/rating/comment | Chỉ đọc/sửa review thuộc customer từ token; UPDATE phải lọc id và customer_id |
| Receptionist | View Review List | Dashboard lễ tân | Danh sách tên khách, sao, nội dung, loại phòng | users.full_name, reviews.rating/comment, room_types.name | reviews, users, room_types | Chỉ xem; lọc is_hidden = 0 vì quyền xem review ẩn chưa được nêu |
| Housekeeper | Không có | Không có | Không có màn hình Review | Không có truy vấn review | — | Không tạo quyền/chức năng |
| Admin | View Review List | Dashboard Admin | Danh sách tên khách, sao, nội dung, loại phòng, trạng thái ẩn/hiện | users.full_name, reviews.rating/comment/is_hidden, room_types.name | reviews, users, room_types | Xem cả ẩn và hiện; chỉ xem, không UPDATE |

### SQL minh họa (SQL Server)

Trong ví dụ dưới, `bookings.customer_id` và `bookings.room_type_id` là tên cột dự kiến để minh họa; thay bằng đúng tên trong DDL nếu khác. Mọi input cần bind parameter.

**Danh sách công khai và aggregate (Guest/Customer):**

```sql
SELECT r.id, r.rating, r.comment, u.full_name AS customer_name,
       rt.id AS room_type_id, rt.name AS room_type_name
FROM reviews r
JOIN users u ON u.id = r.customer_id
JOIN room_types rt ON rt.id = r.room_type_id
WHERE r.room_type_id = @roomTypeId AND r.is_hidden = 0
ORDER BY r.id DESC;

SELECT AVG(CAST(r.rating AS DECIMAL(4,2))) AS average_rating,
       COUNT(*) AS review_count
FROM reviews r
WHERE r.room_type_id = @roomTypeId AND r.is_hidden = 0;
```

Không có cột ngày tạo review đã được xác nhận. `id DESC` là thứ tự theo ID, không được hiển thị như ngày.

**Receptionist xem review công khai:**

```sql
SELECT u.full_name AS customer_name, r.rating, r.comment, rt.name AS room_type_name
FROM reviews r
JOIN users u ON u.id = r.customer_id
JOIN room_types rt ON rt.id = r.room_type_id
WHERE r.is_hidden = 0
ORDER BY r.id DESC;
```

**Admin xem cả review ẩn/hiện:**

```sql
SELECT r.id, u.full_name AS customer_name, r.rating, r.comment,
       rt.name AS room_type_name, r.is_hidden
FROM reviews r
JOIN users u ON u.id = r.customer_id
JOIN room_types rt ON rt.id = r.room_type_id
ORDER BY r.id DESC;
```

**Kiểm tra booking sở hữu và chưa có review:**

```sql
SELECT b.id AS booking_id, b.room_type_id, rt.name AS room_type_name
FROM bookings b
JOIN room_types rt ON rt.id = b.room_type_id
WHERE b.id = @bookingId AND b.customer_id = @authenticatedCustomerId
  AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id);
```

Không tự thêm điều kiện booking hoàn tất/đã thanh toán vì quy tắc đó chưa được xác nhận.

**Tạo review sau khi server xác minh owner, duplicate, và lấy room type từ booking:**

```sql
INSERT INTO reviews (booking_id, customer_id, room_type_id, rating, comment, is_hidden)
VALUES (@bookingId, @authenticatedCustomerId, @verifiedRoomTypeId, @rating, @comment, 0);
```

Cần bảo vệ “mỗi booking một review” trước request đồng thời bằng unique constraint/index trên booking_id hoặc transaction/khóa tương đương; phải kiểm tra DDL hiện có trước khi quyết định migration.

**Đọc và cập nhật review của Customer:**

```sql
SELECT r.id, r.rating, r.comment, r.booking_id, r.room_type_id
FROM reviews r
WHERE r.id = @reviewId AND r.customer_id = @authenticatedCustomerId;

UPDATE reviews SET rating = @rating, comment = @comment
WHERE id = @reviewId AND customer_id = @authenticatedCustomerId;
```

Server lấy customer ID từ danh tính đã xác thực, validate rating nguyên 1..5 và kiểm tra số dòng UPDATE. Không thêm quyền xóa, ẩn/hiện hoặc sửa review cho Admin/Receptionist.

### Cần xác minh với SQL gốc

- DDL bookings: tên cột customer/room type và trạng thái booking; không giả định điều kiện trạng thái.
- FK reviews.booking_id/customer_id/room_type_id; kiểu, nullability, default và constraint của is_hidden.
- Unique constraint/index trên reviews.booking_id để đảm bảo mỗi booking một review.
- Backend hiện dùng users.full_name; xác minh cột này tồn tại trong SQL.
- Schema nêu không có ngày tạo review; không hiển thị ngày, không coi ID là thời gian.
- Xác thực role/ownership ở server. Ẩn nút giao diện không thay thế kiểm tra server.


### Verified SQL Server schema and corrected booking-room mapping

The SQL file named in the request is not present in the workspace. I inspected the configured live database hotel_management using read-only catalog queries. This section supersedes the earlier illustrative assumption that bookings has a room_type_id column.

Verified Review schema:
- reviews.id BIGINT NOT NULL identity primary key.
- booking_id BIGINT NOT NULL, UNIQUE (UQ__reviews__...).
- customer_id BIGINT NOT NULL, FK to users.id BIGINT.
- room_type_id INT NULL, FK to room_types.id INT.
- rating TINYINT NOT NULL, CHECK rating BETWEEN 1 AND 5.
- comment NVARCHAR(MAX) NULL.
- is_hidden BIT NOT NULL DEFAULT (0).
- booking_id has an FK to bookings.id BIGINT.
- Booking ownership is bookings.customer_id. Room types are stored per room row in booking_rooms(booking_id, room_type_id); one booking can contain multiple distinct room types.
- The booking status constraint allows PENDING_PAYMENT, CONFIRMED, CHECKED_IN, CHECKED_OUT and CANCELLED. The database does not define which status is eligible for a review, so no status filter is implied here.

The Create Review flow permits only a booking with exactly one distinct room type. For multi-type bookings, Review Management has no confirmed rule to select the single reviews.room_type_id, so the backend rejects creation instead of guessing.

SQL example: list owned bookings with exactly one room type.

SELECT b.id AS booking_id, b.booking_code, b.status,
       MIN(br.room_type_id) AS room_type_id, MIN(rt.name) AS room_type_name
FROM dbo.bookings b
JOIN dbo.booking_rooms br ON br.booking_id = b.id
JOIN dbo.room_types rt ON rt.id = br.room_type_id
WHERE b.customer_id = @authenticatedCustomerId
GROUP BY b.id, b.booking_code, b.status
HAVING COUNT(DISTINCT br.room_type_id) = 1
ORDER BY b.id DESC;

SQL example: insert after the server locks and verifies the owned booking, confirms one distinct room type and checks for an existing review.

INSERT INTO dbo.reviews (booking_id, customer_id, room_type_id, rating, comment, is_hidden)
SELECT b.id, b.customer_id, MIN(br.room_type_id), @rating, @comment, 0
FROM dbo.bookings b
JOIN dbo.booking_rooms br ON br.booking_id = b.id
WHERE b.id = @bookingId AND b.customer_id = @authenticatedCustomerId
GROUP BY b.id, b.customer_id
HAVING COUNT(DISTINCT br.room_type_id) = 1
   AND NOT EXISTS (SELECT 1 FROM dbo.reviews r WHERE r.booking_id = b.id);

