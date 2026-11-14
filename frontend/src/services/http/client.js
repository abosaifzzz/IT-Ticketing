export class HttpError extends Error {
  constructor(message, { status = 0, code = 'network', retryAfter = null } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}
export function createHttpClient({ baseUrl = '/api', fetchImpl = (...args) => fetch(...args), timeoutMs = 15000, onUnauthorized = () => {} } = {}) {
  const base = baseUrl.replace(/\/$/, '')
  if (!base.startsWith('/') || base.startsWith('//') || base.includes('?') || base.includes('#')) throw new Error('Use a same-origin API path')
  return {
    async request(path, { method = 'GET', body, signal, anonymous = false, responseType = 'json' } = {}) {
      if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) throw new Error('Invalid API path')
      const controller = new AbortController()
      let timedOut = false
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) controller.abort()
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
      try {
        const response = await fetchImpl(base + path, {
          method, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { Accept: responseType === 'csv' ? 'text/csv' : responseType === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : responseType === 'pdf' ? 'application/pdf' : responseType === 'blob' ? 'application/octet-stream' : 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
        if (!response.ok) {
          if (response.status === 401 && !anonymous) onUnauthorized()
          // Keep error copy consistent; never display arbitrary HTML/driver messages.
          const messages = { 400: 'البيانات المدخلة غير صالحة.', 401: anonymous ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : 'انتهت الجلسة. يرجى تسجيل الدخول.', 403: 'ليس لديك صلاحية لهذا الطلب.', 404: 'السجل غير موجود.', 409: 'تغيرت البيانات. حدّث الصفحة وحاول مجددًا.', 429: 'محاولات كثيرة. حاول مرة أخرى لاحقًا.' }
          throw new HttpError(messages[response.status] ?? 'تعذر إتمام الطلب. حاول مرة أخرى.', { status: response.status, code: 'http', retryAfter: response.headers.get('Retry-After') })
        }
        if (['csv','xlsx','pdf','blob'].includes(responseType)) {
          const expectedType = responseType === 'csv' ? 'text/csv' : responseType === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : responseType === 'pdf' ? 'application/pdf' : null
          if (expectedType && !response.headers.get('Content-Type')?.includes(expectedType)) throw new HttpError('استجابة غير صالحة من الخادم.', { code: 'response' })
          return await response.blob()
        }
        if (response.status === 204) return null
        if (!response.headers.get('Content-Type')?.includes('application/json')) throw new HttpError('استجابة غير صالحة من الخادم.', { code: 'response' })
        try { return await response.json() } catch { throw new HttpError('استجابة غير صالحة من الخادم.', { code: 'response' }) }
      } catch (error) {
        if (error instanceof HttpError) throw error
        if (controller.signal.aborted) throw new HttpError(timedOut ? 'انتهت مهلة الاتصال. حاول مرة أخرى.' : 'تم إلغاء الطلب.', { code: timedOut ? 'timeout' : 'aborted' })
        throw new HttpError('تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجددًا.')
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    },
  }
}
