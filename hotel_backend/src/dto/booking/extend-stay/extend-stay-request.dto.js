function toExtendStayRequest(body = {}) { return { expected_check_out_date: body?.expected_check_out_date, new_check_out_date: body?.new_check_out_date, note: body?.note == null ? '' : body?.note }; }
module.exports = { toExtendStayRequest };
