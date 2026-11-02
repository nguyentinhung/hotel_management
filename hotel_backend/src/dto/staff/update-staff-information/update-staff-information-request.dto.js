function toUpdateStaffInformationRequest(body = {}) {
  return {
    full_name: body?.full_name,
    email: body?.email,
    phone: body?.phone,
    gender: body?.gender,
    date_of_birth: body?.date_of_birth,
    address: body?.address,
    position: body?.position,
    hire_date: body?.hire_date,
  };
}
module.exports = { toUpdateStaffInformationRequest };
