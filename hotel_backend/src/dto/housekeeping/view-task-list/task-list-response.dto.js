function toTaskListResponse(tasks) { return { success: true, count: tasks.length, tasks }; }
module.exports = { toTaskListResponse };
