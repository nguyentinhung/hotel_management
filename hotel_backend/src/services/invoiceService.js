const {
  createReceptionInvoice: createReceptionInvoiceDao,
  getInvoiceList: getInvoiceListDao,
  getInvoiceDetails: getInvoiceDetailsDao,
} = require('../dao/invoiceDao');

async function createReceptionInvoice(bookingId, createdByUserId) {
  return await createReceptionInvoiceDao(bookingId, createdByUserId);
}

async function getInvoices(customerId = null) {
  return getInvoiceListDao(customerId);
}

async function getInvoiceDetails(invoiceId, customerId = null) {
  return getInvoiceDetailsDao(invoiceId, customerId);
}

module.exports = { createReceptionInvoice, getInvoices, getInvoiceDetails };
