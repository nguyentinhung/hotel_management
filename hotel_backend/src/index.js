require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { getPool, ensureAuthTables } = require('./config/db');
// Seed data đã được tắt để dùng dữ liệu mẫu bạn insert trực tiếp trong SQL Server.
const { getHomeData, getRoomTypes, getPromotions, getServices, getReviews } = require('./controllers/homeController');
const {
  register,
  login,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword
} = require('./controllers/authController');
const app = express();
const PORT = 5000;
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    const timestamp = Date.now();
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Chỉ chấp nhận ảnh JPG, PNG, WEBP.'));
  },
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Kiểm tra trạng thái backend đang chạy
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Hotel backend is running' });
});

// --- Authentication APIs ---
// Đăng ký tài khoản mới cho khách hàng
app.post('/api/auth/register', register);
// Đăng nhập hệ thống bằng email và mật khẩu
app.post('/api/auth/login', login);
// Đăng xuất và revoke refresh token hiện tại
app.post('/api/auth/logout', logout);
// Xác thực email sau khi tài khoản mới được tạo
app.get('/api/auth/verify-email', verifyEmail);

// Quên mật khẩu
app.post('/api/auth/forgot-password', forgotPassword);

// Đặt lại mật khẩu bằng OTP
app.post('/api/auth/reset-password', resetPassword);
// --- Frontend home data APIs ---
// Lấy dữ liệu tổng hợp cho trang chủ
app.get('/api/home', getHomeData);
// Lấy danh sách loại phòng để render UI
app.get('/api/room-types', getRoomTypes);
// Lấy danh sách khuyến mãi đang active
app.get('/api/promotions/active', getPromotions);
// Lấy danh sách dịch vụ khách sạn
app.get('/api/services', getServices);
// Lấy đánh giá từ khách hàng
app.get('/api/reviews', getReviews);

// Upload ảnh chính cho loại phòng
app.post('/api/room-types/:roomTypeId/image', upload.single('image'), async (req, res) => {
  try {
    const { roomTypeId } = req.params;
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({ message: 'Thiếu file ảnh.' });
    }

    const pool = await getPool();
    const imageUrl = `http://localhost:${PORT}/uploads/${imageFile.filename}`;

    await pool.request()
      .input('roomTypeId', sql.Int, Number(roomTypeId))
      .input('imageUrl', sql.VarChar(500), imageUrl)
      .query(`
        UPDATE room_type_images
        SET is_primary = 0
        WHERE room_type_id = @roomTypeId;

        INSERT INTO room_type_images (room_type_id, image_url, is_primary)
        VALUES (@roomTypeId, @imageUrl, 1);
      `);

    return res.status(201).json({
      message: 'Upload ảnh phòng thành công.',
      roomTypeId: Number(roomTypeId),
      image_url: imageUrl,
    });
  } catch (error) {
    console.error('Upload room image error:', error);
    return res.status(500).json({
      message: 'Upload ảnh thất bại.',
      error: error.message,
    });
  }
});

async function bootstrap() {
  await ensureAuthTables();
  app.listen(PORT, () => {
    console.log(`Hotel backend is running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
