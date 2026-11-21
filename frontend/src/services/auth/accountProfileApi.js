export function createAccountProfileApi(client) {
  return {
    setupOptions(signal) { return client.request('/auth/setup-options', { signal }) },
    profile(signal) { return client.request('/auth/profile', { signal }).then((data) => data.item) },
    completeSetup(body) {
      return client.request('/auth/complete-setup', { method: 'POST', preserveSessionOnUnauthorized: true, body: {
        currentPassword: body.currentPassword, newPassword: body.newPassword,
        phone: body.phone, departmentIds: body.departmentIds,
      } })
    },
    updateProfile(body) { return client.request('/auth/profile', { method: 'PATCH', body: { phone: body.phone, departmentIds: body.departmentIds } }).then((data) => data.item) },
  }
}
