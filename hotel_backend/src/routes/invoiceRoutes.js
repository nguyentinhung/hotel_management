const express = require('express');
const invoiceController = require('../controllers/invoiceController');
const { requireCustomer, requirePaymentStaff } = require('../middlewares/customerAuth');

const router = express.Router();
router.get('/invoices', requirePaymentStaff, invoiceController.getInvoiceList);
router.get('/invoices/my', requireCustomer, invoiceController.getInvoiceList);
router.get('/invoices/:invoiceId', requirePaymentStaff, invoiceController.getInvoiceDetail);
router.get('/invoices/my/:invoiceId', requireCustomer, invoiceController.getInvoiceDetail);

module.exports = router;
