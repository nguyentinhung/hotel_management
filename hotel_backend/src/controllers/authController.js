const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { sql, getPool } = require('../config/db');
const authService = require('../services/authService');
const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const isValidPhone = (phone) => /^\+?[0-9\s\-()]{9,20}$/.test(String(phone || '').trim());

function createMailTransporter() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    const error = new Error('Email chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh. HÃ£y Ä‘áº·t SMTP_USER vÃ  SMTP_PASS trong hotel_backend/.env rá»“i khá»Ÿi Ä‘á»™ng láº¡i backend.');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('SMTP_PORT khÃ´ng há»£p lá»‡.');
    error.code = 'SMTP_CONFIG_INVALID';
    throw error;
  }

  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (secureSetting && secureSetting !== 'true' && secureSetting !== 'false') {
    const error = new Error('SMTP_SECURE chá»‰ nháº­n giÃ¡ trá»‹ true hoáº·c false.');
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
  role_name: user.role_name || 'KhÃ¡ch hÃ ng',
});

async function sendVerificationEmail(user, token, transporter) {
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4173';

  const verificationUrl =
    `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

  await sendEmail({
    // QUAN TRá»ŒNG: gá»­i tá»›i email ngÆ°á»i vá»«a Ä‘Äƒng kÃ½
    to: user.email,

    subject: 'XÃ¡c nháº­n tÃ i khoáº£n Hotel Management',

    html: `
      <h2>ChÃ o ${user.full_name}</h2>

      <p>Cáº£m Æ¡n báº¡n Ä‘Ã£ Ä‘Äƒng kÃ½ tÃ i khoáº£n Hotel Management.</p>

      <p>Vui lÃ²ng báº¥m vÃ o nÃºt bÃªn dÆ°á»›i Ä‘á»ƒ xÃ¡c nháº­n email:</p>

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
          XÃ¡c nháº­n email
        </a>
      </p>

      <p>LiÃªn káº¿t cÃ³ hiá»‡u lá»±c trong 24 giá».</p>

      <p>Náº¿u báº¡n khÃ´ng Ä‘Äƒng kÃ½ tÃ i khoáº£n nÃ y, hÃ£y bá» qua email.</p>
    `,
  }, transporter);

  console.log(`Verification email sent to: ${user.email}`);

  return true;
}
// Táº¡o access token Ä‘á»ƒ client dÃ¹ng cho request tiáº¿p theo trong vÃ²ng 1 giá»
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

// ÄÄƒng kÃ½ tÃ i khoáº£n má»›i, hash máº­t kháº©u, táº¡o token xÃ¡c thá»±c email
async function register(req, res) {
  try {
    const { email, password, full_name, phone_number } = req.body || {};

    if (!email || !password || !full_name || !phone_number) {
      return res.status(400).json({ message: 'Vui lÃ²ng nháº­p Ä‘áº§y Ä‘á»§ email, máº­t kháº©u, há» tÃªn vÃ  sá»‘ Ä‘iá»‡n thoáº¡i.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedName = String(full_name).trim();
    const normalizedPhone = String(phone_number).trim();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Email khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng.' });
    }

    if (!isValidPhone(normalizedPhone)) {
      return res.status(400).json({ message: 'Sá»‘ Ä‘iá»‡n thoáº¡i khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng.' });
    }

    // Validate mail settings before creating an account that cannot be verified.
    const mailTransporter = createMailTransporter();
    const pool = await getPool();

    const existingEmail = await pool.request()
      .input('email', sql.VarChar(150), normalizedEmail)
      .query('SELECT TOP 1 id FROM users WHERE LOWER(email) = LOWER(@email);');

    if (existingEmail.recordset.length > 0) {
      return res.status(409).json({ message: 'Email Ä‘Ã£ tá»“n táº¡i trong há»‡ thá»‘ng.' });
    }

    const existingPhone = await pool.request()
      .input('phone', sql.VarChar(20), normalizedPhone)
      .query('SELECT TOP 1 id FROM users WHERE phone = @phone;');

    if (existingPhone.recordset.length > 0) {
      return res.status(409).json({ message: 'Sá»‘ Ä‘iá»‡n thoáº¡i Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng.' });
    }

    const roleQuery = await pool.request().query("SELECT TOP 1 id, code, name FROM roles WHERE code = 'CUSTOMER';");
    const customerRole = roleQuery.recordset[0];
    if (!customerRole) throw new Error('Customer role is not configured.');

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

    try {
      await sendVerificationEmail(user, verificationToken, mailTransporter);
    } catch (emailError) {
      try {
        await pool.request()
          .input('token', sql.VarChar(255), verificationToken)
          .input('userId', sql.BigInt, user.id)
          .query(`
            DELETE FROM email_verifications WHERE token = @token;
            DELETE FROM users WHERE id = @userId AND status = 'LOCKED';
          `);
      } catch (cleanupError) {
        console.error('Registration email cleanup error:', cleanupError);
      }
      throw emailError;
    }

    return res.status(201).json({
      message: 'ÄÄƒng kÃ½ tÃ i khoáº£n thÃ nh cÃ´ng. Vui lÃ²ng kiá»ƒm tra email Ä‘á»ƒ xÃ¡c thá»±c tÃ i khoáº£n.',
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      message: error.code === 'SMTP_NOT_CONFIGURED' || error.code === 'SMTP_CONFIG_INVALID'
        ? error.message
        : 'ÄÄƒng kÃ½ tháº¥t báº¡i. HÃ£y kiá»ƒm tra káº¿t ná»‘i cÆ¡ sá»Ÿ dá»¯ liá»‡u vÃ  email.',
    });
  }
}

// XÃ¡c thá»±c email ngÆ°á»i dÃ¹ng báº±ng token Ä‘Ã£ gá»­i qua mail
async function verifyEmail(req, res) {
  try {
    const { token } = req.query || {};

    if (!token) {
      return res.status(400).json({ message: 'Thiáº¿u token xÃ¡c thá»±c.' });
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
      return res.status(400).json({ message: 'Token xÃ¡c thá»±c khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.' });
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

    return res.json({ message: 'XÃ¡c thá»±c email thÃ nh cÃ´ng.' });
  } catch (error) {
    console.error('Verify email error:', error);
    return res.status(500).json({
      message: 'XÃ¡c thá»±c email tháº¥t báº¡i.',
      error: error.message,
    });
  }
}

// ÄÄƒng nháº­p há»‡ thá»‘ng: kiá»ƒm tra email, máº­t kháº©u, tráº¡ng thÃ¡i vÃ  táº¡o JWT
async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: 'Vui lÃ²ng nháº­p email vÃ  máº­t kháº©u.',
      });
    }

    const result = await authService.login(
      normalizeEmail(email),
      password
    );

    if (result.status) {
      return res.status(result.status).json({
        message: result.message,
      });
    }

    const { user, refreshToken } = result;
    const accessToken = createAccessToken(user);

    return res.json({
      accessToken,
      refreshToken,
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      message: 'ÄÄƒng nháº­p tháº¥t báº¡i.',
      error: error.message,
    });
  }
}

// ÄÄƒng xuáº¥t: vÃ´ hiá»‡u hÃ³a refresh token Ä‘ang sá»­ dá»¥ng
async function logout(req, res) {
  try {
    const token = req.body?.refreshToken
      || req.headers['x-refresh-token'];

    await authService.logout(token);

    return res.json({
      message: 'ÄÄƒng xuáº¥t thÃ nh cÃ´ng.'
    });
  } catch (error) {
    console.error('Logout error:', error);

    return res.status(500).json({
      message: 'ÄÄƒng xuáº¥t tháº¥t báº¡i.',
      error: error.message
    });
  }
}

async function forgotPassword(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: 'Email khÃ´ng há»£p lá»‡.',
      });
    }

    const mailTransporter = createMailTransporter();
    const pool = await getPool();

    // Chá»‰ cho phÃ©p tÃ i khoáº£n ACTIVE
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

    // KhÃ´ng tiáº¿t lá»™ email cÃ³ tá»“n táº¡i hay khÃ´ng
    if (!userResult.recordset.length) {
      return res.json({
        message: 'Náº¿u email tá»“n táº¡i, mÃ£ OTP Ä‘Ã£ Ä‘Æ°á»£c gá»­i.',
      });
    }

    const user = userResult.recordset[0];

    // VÃ´ hiá»‡u hÃ³a OTP cÅ©
    await pool.request()
      .input('userId', sql.BigInt, user.id)
      .query(`
        UPDATE password_resets
        SET is_used = 1
        WHERE user_id = @userId
          AND is_used = 0;
      `);

    // Táº¡o OTP 6 sá»‘
    const otpCode = String(
      crypto.randomInt(100000, 1000000)
    );

    // Táº¡o password reset record
    const resetInsert = await pool.request()
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
        OUTPUT INSERTED.id
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

    // Gá»­i OTP
    try {
      await sendEmail({
        to: user.email,
        subject: 'MÃ£ OTP Ä‘áº·t láº¡i máº­t kháº©u',
        html: `
        <h2>Äáº·t láº¡i máº­t kháº©u</h2>

        <p>Xin chÃ o ${user.full_name},</p>

        <p>MÃ£ OTP Ä‘á»ƒ Ä‘áº·t láº¡i máº­t kháº©u cá»§a báº¡n lÃ :</p>

        <h1 style="letter-spacing: 5px;">
          ${otpCode}
        </h1>

        <p>MÃ£ OTP cÃ³ hiá»‡u lá»±c trong <b>10 phÃºt</b>.</p>

        <p>Náº¿u báº¡n khÃ´ng yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u,
        vui lÃ²ng bá» qua email nÃ y.</p>
        `,
      }, mailTransporter);
    } catch (emailError) {
      await pool.request()
        .input('resetId', sql.BigInt, resetInsert.recordset[0].id)
        .query('UPDATE password_resets SET is_used = 1 WHERE id = @resetId;');
      throw emailError;
    }

    console.log(`Password reset OTP sent to: ${user.email}`);

    return res.json({
      message: 'Náº¿u email tá»“n táº¡i, mÃ£ OTP Ä‘Ã£ Ä‘Æ°á»£c gá»­i.',
    });

  } catch (error) {
    console.error('Forgot password error:', error);

    return res.status(500).json({
      message: error.code === 'SMTP_NOT_CONFIGURED' || error.code === 'SMTP_CONFIG_INVALID'
        ? error.message
        : 'KhÃ´ng thá»ƒ gá»­i mÃ£ OTP. HÃ£y kiá»ƒm tra cáº¥u hÃ¬nh email vÃ  káº¿t ná»‘i SMTP.',
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
        message: 'Email khÃ´ng há»£p lá»‡.',
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: 'OTP pháº£i gá»“m 6 chá»¯ sá»‘.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±.',
      });
    }

    const pool = await getPool();

    // TÃ¬m user
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
        message: 'OTP hoáº·c email khÃ´ng há»£p lá»‡.',
      });
    }

    const userId = userResult.recordset[0].id;

    // Kiá»ƒm tra OTP
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
        message: 'OTP khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.',
      });
    }

    const resetRecord = otpResult.recordset[0];

    // Hash password má»›i
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Äá»•i password
    await pool.request()
      .input('userId', sql.BigInt, userId)
      .input('passwordHash', sql.VarChar(255), passwordHash)
      .query(`
        UPDATE users
        SET password_hash = @passwordHash
        WHERE id = @userId;
      `);

    // ÄÃ¡nh dáº¥u OTP Ä‘Ã£ sá»­ dá»¥ng
    await pool.request()
      .input('resetId', sql.BigInt, resetRecord.id)
      .query(`
        UPDATE password_resets
        SET is_used = 1
        WHERE id = @resetId;
      `);

    // VÃ´ hiá»‡u hÃ³a cÃ¡c OTP cÅ© cÃ²n láº¡i
    await pool.request()
      .input('userId', sql.BigInt, userId)
      .query(`
        UPDATE password_resets
        SET is_used = 1
        WHERE user_id = @userId
          AND is_used = 0;
      `);

    return res.json({
      message: 'Äáº·t láº¡i máº­t kháº©u thÃ nh cÃ´ng.',
    });

  } catch (error) {
    console.error('Reset password error:', error);

    return res.status(500).json({
      message: 'Äáº·t láº¡i máº­t kháº©u tháº¥t báº¡i.',
      error: error.message,
    });
  }
}

async function changePassword(req, res) {
  try {
    const userId = Number(req.auth?.userId);
    const { currentPassword, newPassword } = req.body || {};
    if (!userId) return res.status(401).json({ message: 'Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i.' });
    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !newPassword) {
      return res.status(400).json({ message: 'Vui lÃ²ng nháº­p máº­t kháº©u hiá»‡n táº¡i vÃ  máº­t kháº©u má»›i.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Máº­t kháº©u má»›i pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±.' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.BigInt, userId)
      .query('SELECT password_hash, status FROM users WHERE id = @userId;');
    const user = result.recordset[0];
    if (!user) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n.' });
    if (String(user.status).toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({ message: 'TÃ i khoáº£n chÆ°a Ä‘Æ°á»£c kÃ­ch hoáº¡t hoáº·c Ä‘Ã£ bá»‹ khÃ³a.' });
    }

    const matches = user.password_hash === currentPassword
      || await bcrypt.compare(currentPassword, user.password_hash).catch(() => false);
    if (!matches) return res.status(400).json({ message: 'Máº­t kháº©u hiá»‡n táº¡i khÃ´ng Ä‘Ãºng.' });
    if (await bcrypt.compare(newPassword, user.password_hash).catch(() => false)) {
      return res.status(400).json({ message: 'Máº­t kháº©u má»›i pháº£i khÃ¡c máº­t kháº©u hiá»‡n táº¡i.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.request()
      .input('userId', sql.BigInt, userId)
      .input('passwordHash', sql.VarChar(255), passwordHash)
      .query('UPDATE users SET password_hash = @passwordHash WHERE id = @userId;');
    return res.json({ message: 'Äá»•i máº­t kháº©u thÃ nh cÃ´ng.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'KhÃ´ng thá»ƒ Ä‘á»•i máº­t kháº©u lÃºc nÃ y.' });
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
