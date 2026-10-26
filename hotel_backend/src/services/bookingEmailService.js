
const nodemailer = require('nodemailer');

async function sendBookingConfirmationEmail(customer, booking) {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (!user || !pass) {
        throw new Error('SMTP_USER hoặc SMTP_PASS chưa được cấu hình.');
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth: { user, pass },
    });

    const formatDate = (value) =>
        new Date(value).toLocaleDateString('vi-VN', { timeZone: 'UTC' });

    await transporter.sendMail({
        from: process.env.SMTP_FROM || user,
        to: customer.email,
        subject: `Xác nhận đặt phòng - ${booking.booking_code}`,
        text: `
Xin chào ${customer.full_name},

Booking của bạn đã được xác nhận và hệ thống đã ghi nhận tiền cọc mô phỏng.

Mã booking: ${booking.booking_code}
Ngày nhận phòng: ${formatDate(booking.check_in_date)}
Ngày trả phòng: ${formatDate(booking.check_out_date)}
Số tiền cọc: ${Number(booking.deposit_amount || 0).toLocaleString('vi-VN')} VND

Đây là giao dịch mô phỏng, không phải khoản thanh toán tiền thật.

Trân trọng,
Hotel Management
    `.trim(),
    });
}

module.exports = { sendBookingConfirmationEmail };
