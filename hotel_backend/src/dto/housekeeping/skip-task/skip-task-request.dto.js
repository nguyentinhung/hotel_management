function toSkipCleaningTaskRequest(body = {}) { return { skip_reason: body?.skip_reason }; }
module.exports = { toSkipCleaningTaskRequest };
