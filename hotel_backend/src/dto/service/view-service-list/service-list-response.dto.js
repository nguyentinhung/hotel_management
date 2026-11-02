function toServiceListResponse(services) { return services.map((service) => ({ ...service })); }
module.exports = { toServiceListResponse };
