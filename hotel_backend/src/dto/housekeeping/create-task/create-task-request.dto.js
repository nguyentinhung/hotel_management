function toCreateCleaningTaskRequest(body = {}) { return { task_type: body?.task_type, room_id: body?.room_id, booking_room_id: body?.booking_room_id, priority: body?.priority, special_instructions: body?.special_instructions, notes: body?.notes, request_key: body?.request_key }; }
module.exports = { toCreateCleaningTaskRequest };
