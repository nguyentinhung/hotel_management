function toStaffListResponse(staff) { return { success: true, count: staff.length, staff }; }
module.exports = { toStaffListResponse };
