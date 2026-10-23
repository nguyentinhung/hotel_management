const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const authService = require('../services/authService');
const UserModel = require('../models/userModel');

const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';




function createMailTransporter() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    const error = new Error('Email chưa được cấu hình. Hãy đặt SMTP_USER và SMTP_PASS trong hotel_backend/.env rồi khởi động lại backend.');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('SMTP_PORT không hợp lệ.');
    error.code = 'SMTP_CONFIG_INVALID';
    throw error;
  }

  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (secureSetting && secureSetting !== 'true' && secureSetting !== 'false') {
    const error = new Error('SMTP_SECURE chỉ nhận giá trị true hoặc false.');
    error.code = 'SMTP_CONFIG_INVALID';
    throw error;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: secureSetting ? secureSetting === 'true' : port === 465,
    auth: { user, pass },
  });
}

function sendEmail(message, transporter = createMailTransporter()) {
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    ...message,
  });
}

const buildUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  full_name: user.full_name,
  phone: user.phone,
  status: String(user.status || '').toUpperCase(),
  role_id: user.role_id,
  role_code: user.role_code,
  role_name: user.role_name || 'Khách hàng',
});

async function sendVerificationEmail(user, token, transporter) {
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4173';

  const verificationUrl =
    `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

  await sendEmail({
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
  }, transporter);

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

    const normalizedEmail = UserModel.normalizeEmail(email);
    const normalizedName = String(full_name).trim();
    const normalizedPhone = UserModel.normalizePhone(phone_number);

    if (!UserModel.isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Email không đúng định dạng.' });
    }

    if (!UserModel.isValidPhone(normalizedPhone)) {
      return res.status(400).json({ message: 'Số điện thoại không đúng định dạng.' });
    }

    // Validate mail settings before creating an account that cannot be verified.
    const mailTransporter = createMailTransporter();
    const existingEmail = await authService.findUserIdByEmail(normalizedEmail);
    if (existingEmail) return res.status(409).json({ message: 'Email đã tồn tại trong hệ thống.' });
    const existingPhone = await authService.findUserIdByPhone(normalizedPhone);
    if (existingPhone) return res.status(409).json({ message: 'Số điện thoại đã được sử dụng.' });
    const customerRole = await authService.getCustomerRole();
    if (!customerRole) throw new Error('Customer role is not configured.');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await authService.createUser({ roleId: customerRole.id, email: normalizedEmail, passwordHash, fullName: normalizedName, phone: normalizedPhone });
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await authService.createEmailVerification(user.id, verificationToken, expiresAt);

    try {
      await sendVerificationEmail(user, verificationToken, mailTransporter);
    } catch (emailError) {
      try {
        await authService.cleanupPendingRegistration(user.id, verificationToken);
      } catch (cleanupError) {
        console.error('Registration email cleanup error:', cleanupError);
      }
      throw emailError;
    }

    return res.status(201).json({
      message: 'Đăng ký tài khoản thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      message: error.code === 'SMTP_NOT_CONFIGURED' || error.code === 'SMTP_CONFIG_INVALID'
        ? error.message
        : 'Đăng ký thất bại. Hãy kiểm tra kết nối cơ sở dữ liệu và email.',
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

    const verification = await authService.getValidEmailVerification(String(token));

    if (!verification) {
      return res.status(400).json({ message: 'Token xác thực không hợp lệ hoặc đã hết hạn.' });
    }

    const record = verification;

    await authService.activateVerifiedUser(record.user_id, String(token));

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

    const user = await authService.getUserByEmail(UserModel.normalizeEmail(email));

    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }

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

    await authService.createRefreshToken(user.id, refreshToken, refreshExpiresAt);

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

    await authService.revokeRefreshToken(String(token));

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
  changePassword,
};
async function forgotPassword(req, res) {
  try {
    const email = UserModel.normalizeEmail(req.body?.email);

    if (!UserModel.isValidEmail(email)) {
      return res.status(400).json({
        message: 'Email không hợp lệ.',
      });
    }

    const mailTransporter = createMailTransporter();
    const user = await authService.getActiveUserByEmail(email);

    if (!user) {
      return res.json({
        message: 'Nếu email tồn tại, mã OTP đã được gửi.',
      });
    }



    // Vô hiệu hóa OTP cũ
    await authService.invalidateUnusedPasswordResets(user.id);

    // Tạo OTP 6 số
    const otpCode = String(
      crypto.randomInt(100000, 1000000)
    );

    // Tạo password reset record
    const resetId = await authService.createPasswordResetOtp(user.id, otpCode);

    // Gửi OTP
    try {
      await sendEmail({
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
      }, mailTransporter);
    } catch (emailError) {
      await authService.markPasswordResetUsed(resetId);
      throw emailError;
    }

    console.log(`Password reset OTP sent to: ${user.email}`);

    return res.json({
      message: 'Nếu email tồn tại, mã OTP đã được gửi.',
    });

  } catch (error) {
    console.error('Forgot password error:', error);

    return res.status(500).json({
      message: error.code === 'SMTP_NOT_CONFIGURED' || error.code === 'SMTP_CONFIG_INVALID'
        ? error.message
        : 'Không thể gửi mã OTP. Hãy kiểm tra cấu hình email và kết nối SMTP.',
    });
  }
}
async function resetPassword(req, res) {
  try {
    const email = UserModel.normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!UserModel.isValidEmail(email)) {
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

    const userId = await authService.getActiveUserIdByEmail(email);

    if (!userId) {
      return res.status(400).json({
        message: 'OTP hoặc email không hợp lệ.',
      });
    }



    // Kiểm tra OTP
    const resetRecord = await authService.getLatestValidPasswordReset(userId, otp);

    if (!resetRecord) {
      return res.status(400).json({
        message: 'OTP không hợp lệ hoặc đã hết hạn.',
      });
    }



    // Hash password mới
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Đổi password
    await authService.updatePassword(userId, passwordHash);
    await authService.markPasswordResetUsed(resetRecord.id);
    await authService.markPasswordResetsUsedForUser(userId);

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

async function changePassword(req, res) {
  try {
    const userId = Number(req.auth?.userId);
    const { currentPassword, newPassword } = req.body || {};
    if (!userId) return res.status(401).json({ message: 'Vui lòng đăng nhập lại.' });
    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const user = await authService.getPasswordState(userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    if (String(user.status).toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({ message: 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.' });
    }

    const matches = user.password_hash === currentPassword
      || await bcrypt.compare(currentPassword, user.password_hash).catch(() => false);
    if (!matches) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng.' });
    if (await bcrypt.compare(newPassword, user.password_hash).catch(() => false)) {
      return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await authService.updatePassword(userId, passwordHash);
    return res.json({ message: 'Đổi mật khẩu thành công.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Không thể đổi mật khẩu lúc này.' });
  }
}
