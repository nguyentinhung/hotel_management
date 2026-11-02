function toAssignCleaningTaskRequest(body = {}) { return { assigned_to: body?.assigned_to }; }
module.exports = { toAssignCleaningTaskRequest };
