const jwt = require('jsonwebtoken');
const { createReceptionInvoice, getInvoices, getInvoiceDetails } = require('../services/invoiceService');
const { jwtSecret: JWT_SECRET } = require('../config/auth');
const { toInvoiceListResponse } = require('../dto/invoice/view-invoice-list/invoice-list-response.dto');
const { toInvoiceDetailsResponse } = require('../dto/invoice/view-invoice-details/invoice-details-response.dto');
const { toGenerateInvoiceResponse } = require('../dto/invoice/generate-invoice/generate-invoice-response.dto');
const roleCodeById = { 1: 'ADMIN', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'CUSTOMER' };
const hasRole = (claims, ...roles) => {
  const roleCode = String(claims.role_code || '').toUpperCase() || roleCodeById[Number(claims.role_id)];
  return roles.includes(roleCode);
};

async function getInvoiceList(req, res) {
  try {
    const customerId = req.auth.roleCode === 'CUSTOMER' ? req.auth.userId : null;
    return res.json(toInvoiceListResponse(await getInvoices(customerId)));
  } catch (error) {
    console.error('Get invoice list error:', error);
    return res.status(500).json({ message: 'Khong the tai danh sach hoa don.' });
  }
}

async function getInvoiceDetail(req, res) {
  const invoiceId = Number(req.params.invoiceId);
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
    return res.status(400).json({ message: 'Mã hóa đơn không hợp lệ.' });
  }
  try {
    const customerId = req.auth.roleCode === 'CUSTOMER' ? req.auth.userId : null;
    const invoice = await getInvoiceDetails(invoiceId, customerId);
    if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    return res.json(toInvoiceDetailsResponse(invoice));
  } catch (error) {
    console.error('Get invoice detail error:', error);
    return res.status(500).json({ message: 'Không thể tải chi tiết hóa đơn.' });
  }
}

async function createReceptionInvoiceHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) {
    return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc quản trị viên mới được tạo hóa đơn.' });
  }
  const bookingId = Number(req.params.bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ success: false, message: 'Mã booking không hợp lệ.' });
  }
  try {
    const invoice = await createReceptionInvoice(bookingId, claims.user_id);
    return res.json(toGenerateInvoiceResponse(invoice));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Create reception invoice error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tạo hóa đơn.' });
  }
}

module.exports = { getInvoiceList, getInvoiceDetail, createReceptionInvoiceHandler };
