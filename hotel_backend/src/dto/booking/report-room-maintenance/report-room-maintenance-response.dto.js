function toReportRoomMaintenanceResponse(report) { return { success: true, message: 'Đã gửi báo cáo bảo trì. Phòng vẫn ở danh sách cần dọn đến khi xác nhận dọn xong.', report }; }
module.exports = { toReportRoomMaintenanceResponse };
