function toAssignCheckoutCleaningTaskResponse(result) { return { success: true, created: result.created, already_assigned: result.already_assigned, task: result.task }; }
module.exports = { toAssignCheckoutCleaningTaskResponse };
