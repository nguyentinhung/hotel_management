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
