function toCreateCleaningTaskResponse(result) { return { success: true, replayed: result.replayed, task: result.task }; }
module.exports = { toCreateCleaningTaskResponse };
