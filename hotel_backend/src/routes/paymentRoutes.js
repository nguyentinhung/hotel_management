const express = require('express');
const paymentController = require('../controllers/paymentController');
const vnpayController = require('../controllers/vnpayController');
const { requireCustomer, requirePaymentStaff, requirePaymentActor } = require('../middlewares/customerAuth');

const router = express.Router();
router.post('/payments', requireCustomer, paymentController.createPayment);
router.get('/payments', requirePaymentStaff, paymentController.getPaymentList);
router.get('/payments/my', requireCustomer, paymentController.getCustomerPaymentList);
router.get('/invoices', requirePaymentStaff, paymentController.getInvoiceList);
router.get('/invoices/my', requireCustomer, paymentController.getInvoiceList);
router.get('/invoices/:invoiceId', requirePaymentStaff, paymentController.getInvoiceDetail);
router.get('/invoices/my/:invoiceId', requireCustomer, paymentController.getInvoiceDetail);
router.get('/payments/:paymentCode/status', requirePaymentActor, paymentController.getPaymentStatusRequest);
router.get('/payments/:paymentCode', requirePaymentActor, paymentController.getPaymentDetailsRequest);
router.patch('/payments/:paymentCode/confirm', requirePaymentStaff, paymentController.confirmPaymentRequest);
router.post('/payments/:paymentCode/simulate', requireCustomer, paymentController.simulateDepositPaymentRequest);

if (String(process.env.VNPAY_ENABLED || '').toLowerCase() === 'true') {
  router.get('/payments/vnpay/return', vnpayController.handleVnpayReturn);
  router.get('/payments/vnpay/ipn', vnpayController.handleVnpayIpn);
}

module.exports = router;
