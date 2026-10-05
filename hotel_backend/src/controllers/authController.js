const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { sql, getPool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';
const DEFAULT_CUSTOMER_ROLE = 1;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const isValidPhone = (phone) => /^\+?[0-9\s\-()]{9,20}$/.test(String(phone || '').trim());

const buildUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  full_name: user.full_name,
  phone: user.phone,
  status: String(user.status || '').toUpperCase(),
  role_id: user.role_id,
  role_name: user.role_name || 'Khách hàng',
});

async function sendVerificationEmail(user, token) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4173';

  const verificationUrl =
    `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,

    // QUAN TRỌNG: gửi tới email người vừa đăng ký
    to: user.email,

    subject: 'Xác nhận tài khoản Hotel Management',

    html: `
      <h2>Chào ${user.full_name}</h2>

      <p>Cảm ơn bạn đã đăng ký tài khoản Hotel Management.</p>

      <p>Vui lòng bấm vào nút bên dưới để xác nhận email:</p>

      <p>
        <a href="${verificationUrl}"
           style="
             display:inline-block;
             padding:10px 20px;
             background:#007bff;
             color:white;
             text-decoration:none;
             border-radius:5px;
           ">
          Xác nhận email
        </a>
      </p>

      <p>Liên kết có hiệu lực trong 24 giờ.</p>

      <p>Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.</p>
    `,
  });

  console.log(`Verification email sent to: ${user.email}`);

  return true;
}
// Tạo access token để client dùng cho request tiếp theo trong vòng 1 giờ
const createAccessToken = (user) => jwt.sign(
  {
    user_id: user.id,
    email: user.email,
    role_id: user.role_id,
    role_code: user.role_code,
  },
  JWT_SECRET,
  { expiresIn: '1h' },
);

// Đăng ký tài khoản mới, hash mật khẩu, tạo token xác thực email
async function register(req, res) {
  try {
    const { email, password, full_name, phone_number } = req.body || {};

    if (!email || !password || !full_name || !phone_number) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ email, mật khẩu, họ tên và số điện thoại.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedName = String(full_name).trim();
    const normalizedPhone = String(phone_number).trim();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Email không đúng định dạng.' });
    }

    if (!isValidPhone(normalizedPhone)) {
      return res.status(400).json({ message: 'Số điện thoại không đúng định dạng.' });
    }

    const pool = await getPool();

    const existingEmail = await pool.request()
      .input('email', sql.VarChar(150), normalizedEmail)
      .query('SELECT TOP 1 id FROM users WHERE LOWER(email) = LOWER(@email);');

    if (existingEmail.recordset.length > 0) {
      return res.status(409).json({ message: 'Email đã tồn tại trong hệ thống.' });
    }

    const existingPhone = await pool.request()
      .input('phone', sql.VarChar(20), normalizedPhone)
      .query('SELECT TOP 1 id FROM users WHERE phone = @phone;');

    if (existingPhone.recordset.length > 0) {
      return res.status(409).json({ message: 'Số điện thoại đã được sử dụng.' });
    }

    const roleQuery = await pool.request().query("SELECT TOP 1 id, code, name FROM roles WHERE code = 'CUSTOMER';");
    const customerRole = roleQuery.recordset[0] || { id: DEFAULT_CUSTOMER_ROLE, code: 'CUSTOMER', name: 'Khách hàng' };

    const passwordHash = await bcrypt.hash(password, 10);
    const insertResult = await pool.request()
      .input('role_id', sql.TinyInt, customerRole.id)
      .input('email', sql.VarChar(150), normalizedEmail)
      .input('password_hash', sql.VarChar(255), passwordHash)
      .input('full_name', sql.NVarChar(255), normalizedName)
      .input('phone', sql.VarChar(20), normalizedPhone)
      .input('status', sql.VarChar(20), 'LOCKED')
      .query(`
        INSERT INTO users (role_id, email, password_hash, full_name, phone, status)
        OUTPUT INSERTED.*
        VALUES (@role_id, @email, @password_hash, @full_name, @phone, @status);
      `);

    const user = insertResult.recordset[0];
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.request()
      .input('user_id', sql.BigInt, user.id)
      .input('token', sql.VarChar(255), verificationToken)
      .input('expires_at', sql.DateTimeOffset, expiresAt)
      .query(`
        INSERT INTO email_verifications (user_id, token, expires_at, type)
        VALUES (@user_id, @token, @expires_at, 'email_verification');
      `);

    const emailSent = await sendVerificationEmail(user, verificationToken);

    return res.status(201).json({
      message: 'Đăng ký tài khoản thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      message: 'Đăng ký thất bại.',
      error: error.message,
    });
  }
}

// Xác thực email người dùng bằng token đã gửi qua mail
async function verifyEmail(req, res) {
  try {
    const { token } = req.query || {};

    if (!token) {
      return res.status(400).json({ message: 'Thiếu token xác thực.' });
    }

    const pool = await getPool();
    const verification = await pool.request()
      .input('token', sql.VarChar(255), String(token))
      .query(`
        SELECT TOP 1 *
        FROM email_verifications
        WHERE token = @token
          AND used_at IS NULL
          AND expires_at > SYSUTCDATETIME();
      `);

    if (!verification.recordset.length) {
      return res.status(400).json({ message: 'Token xác thực không hợp lệ hoặc đã hết hạn.' });
    }

    const record = verification.recordset[0];

    await pool.request()
      .input('user_id', sql.BigInt, record.user_id)
      .query(`
        UPDATE users
        SET status = 'ACTIVE'
        WHERE id = @user_id;
      `);

    await pool.request()
      .input('token', sql.VarChar(255), String(token))
      .query(`
        UPDATE email_verifications
        SET used_at = SYSUTCDATETIME()
        WHERE token = @token;
      `);

    return res.json({ message: 'Xác thực email thành công.' });
  } catch (error) {
    console.error('Verify email error:', error);
    return res.status(500).json({
      message: 'Xác thực email thất bại.',
      error: error.message,
    });
  }
}

// Đăng nhập hệ thống: kiểm tra email, mật khẩu, trạng thái và tạo JWT
async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu.' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('email', sql.VarChar(150), normalizeEmail(email))
      .query(`
        SELECT u.id, u.email, u.password_hash, u.full_name, u.phone, u.status, u.role_id,
               r.code AS role_code, r.name AS role_name
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE LOWER(u.email) = LOWER(@email);
      `);

    if (!result.recordset.length) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }

    const user = result.recordset[0];
    const legacyPasswordMatch = user.password_hash === password;
    const isMatch = legacyPasswordMatch || (await bcrypt.compare(password, user.password_hash).catch(() => false));

    if (!isMatch) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }

    if (String(user.status).toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({ message: 'Tài khoản đang chờ xác thực hoặc đã bị khóa.' });
    }

    const accessToken = createAccessToken(user);
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.request()
      .input('user_id', sql.BigInt, user.id)
      .input('token', sql.VarChar(255), refreshToken)
      .input('expires_at', sql.DateTimeOffset, refreshExpiresAt)
      .query(`
        INSERT INTO refresh_tokens (user_id, token, expires_at)
        VALUES (@user_id, @token, @expires_at);
      `);

    return res.json({
      accessToken,
      refreshToken,
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      message: 'Đăng nhập thất bại.',
      error: error.message,
    });
  }
}

// Đăng xuất: vô hiệu hóa refresh token đang sử dụng để khóa session hiện tại
async function logout(req, res) {
  try {
    const token = req.body?.refreshToken || req.headers['x-refresh-token'];

    if (!token) {
      return res.json({ message: 'Đăng xuất thành công.' });
    }

    const pool = await getPool();
    await pool.request()
      .input('token', sql.VarChar(255), String(token))
      .query(`
        UPDATE refresh_tokens
        SET revoked_at = SYSUTCDATETIME()
        WHERE token = @token AND revoked_at IS NULL;
      `);

    return res.json({ message: 'Đăng xuất thành công.' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      message: 'Đăng xuất thất bại.',
      error: error.message,
    });
  }
}

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
async function forgotPassword(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: 'Email không hợp lệ.',
      });
    }

    const pool = await getPool();

    // Chỉ cho phép tài khoản ACTIVE
    const userResult = await pool.request()
      .input('email', sql.VarChar(150), email)
      .query(`
        SELECT TOP 1
          id,
          email,
          full_name,
          status
        FROM users
        WHERE email = @email
          AND status = 'ACTIVE';
      `);

    // Không tiết lộ email có tồn tại hay không
    if (!userResult.recordset.length) {
      return res.json({
        message: 'Nếu email tồn tại, mã OTP đã được gửi.',
      });
    }

    const user = userResult.recordset[0];

    // Vô hiệu hóa OTP cũ
    await pool.request()
      .input('userId', sql.BigInt, user.id)
      .query(`
        UPDATE password_resets
        SET is_used = 1
        WHERE user_id = @userId
          AND is_used = 0;
      `);

    // Tạo OTP 6 số
    const otpCode = String(
      crypto.randomInt(100000, 1000000)
    );

    // Tạo password reset record
    await pool.request()
      .input('userId', sql.BigInt, user.id)
      .input('otpCode', sql.VarChar(10), otpCode)
      .query(`
        INSERT INTO password_resets
        (
          user_id,
          otp_code,
          token,
          expires_at,
          is_used,
          created_at
        )
        VALUES
        (
          @userId,
          @otpCode,
          NULL,
          DATEADD(MINUTE, 10, SYSDATETIME()),
          0,
          SYSDATETIME()
        );
      `);

    // Gửi OTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Mã OTP đặt lại mật khẩu',
      html: `
        <h2>Đặt lại mật khẩu</h2>

        <p>Xin chào ${user.full_name},</p>

        <p>Mã OTP để đặt lại mật khẩu của bạn là:</p>

        <h1 style="letter-spacing: 5px;">
          ${otpCode}
        </h1>

        <p>Mã OTP có hiệu lực trong <b>10 phút</b>.</p>

        <p>Nếu bạn không yêu cầu đặt lại mật khẩu,
        vui lòng bỏ qua email này.</p>
      `,
    });

    console.log(`Password reset OTP sent to: ${user.email}`);

    return res.json({
      message: 'Nếu email tồn tại, mã OTP đã được gửi.',
    });

  } catch (error) {
    console.error('Forgot password error:', error);

    return res.status(500).json({
      message: 'Không thể gửi mã OTP.',
      error: error.message,
    });
  }
}
async function resetPassword(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: 'Email không hợp lệ.',
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: 'OTP phải gồm 6 chữ số.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Mật khẩu phải có ít nhất 6 ký tự.',
      });
    }

    const pool = await getPool();

    // Tìm user
    const userResult = await pool.request()
      .input('email', sql.VarChar(150), email)
      .query(`
        SELECT TOP 1 id
        FROM users
        WHERE email = @email
          AND status = 'ACTIVE';
      `);

    if (!userResult.recordset.length) {
      return res.status(400).json({
        message: 'OTP hoặc email không hợp lệ.',
      });
    }

    const userId = userResult.recordset[0].id;

    // Kiểm tra OTP
    const otpResult = await pool.request()
      .input('userId', sql.BigInt, userId)
      .input('otp', sql.VarChar(10), otp)
      .query(`
        SELECT TOP 1
          id,
          expires_at,
          is_used
        FROM password_resets
        WHERE user_id = @userId
          AND otp_code = @otp
          AND is_used = 0
          AND expires_at > SYSDATETIME()
        ORDER BY created_at DESC;
      `);

    if (!otpResult.recordset.length) {
      return res.status(400).json({
        message: 'OTP không hợp lệ hoặc đã hết hạn.',
      });
    }

    const resetRecord = otpResult.recordset[0];

    // Hash password mới
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Đổi password
    await pool.request()
      .input('userId', sql.BigInt, userId)
      .input('passwordHash', sql.VarChar(255), passwordHash)
      .query(`
        UPDATE users
        SET password_hash = @passwordHash
        WHERE id = @userId;
      `);

    // Đánh dấu OTP đã sử dụng
    await pool.request()
      .input('resetId', sql.BigInt, resetRecord.id)
      .query(`
        UPDATE password_resets
        SET is_used = 1
        WHERE id = @resetId;
      `);

    // Vô hiệu hóa các OTP cũ còn lại
    await pool.request()
      .input('userId', sql.BigInt, userId)
      .query(`
        UPDATE password_resets
        SET is_used = 1
        WHERE user_id = @userId
          AND is_used = 0;
      `);

    return res.json({
      message: 'Đặt lại mật khẩu thành công.',
    });

  } catch (error) {
    console.error('Reset password error:', error);

    return res.status(500).json({
      message: 'Đặt lại mật khẩu thất bại.',
      error: error.message,
    });
  }
}