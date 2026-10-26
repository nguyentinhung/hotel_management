const BaseModel = require('./baseModel');

class RoomMaintenanceReportModel extends BaseModel {
  static get schema() {
    return {
      name: 'RoomMaintenanceReportModel', table: 'room_problem_reports', primaryKey: 'id',
      fields: ['id', 'room_id', 'room_number', 'reported_by', 'reporter_name', 'title', 'description', 'status', 'reported_at'],
    };
  }
}

module.exports = RoomMaintenanceReportModel;
