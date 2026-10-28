const nodemailer = require('nodemailer');

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

module.exports = { createMailTransporter, sendEmail };
