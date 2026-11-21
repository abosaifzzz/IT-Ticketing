export class HttpError extends Error {
  constructor(message, { status = 0, code = 'network', retryAfter = null } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}
// Shown by every feature when the server cannot be reached (network down, timeout, server/proxy offline).
export const IT_SUPPORT_PHONE = '01018335538'
export const CONNECTION_LOST_MESSAGE = `انقطع الاتصال بالخادم. تحقق من اتصال الشبكة وحاول مرة أخرى. إذا استمرت المشكلة تواصل مع قسم تكنولوجيا المعلومات على ${IT_SUPPORT_PHONE}.`

export function createHttpClient({ baseUrl = '/api', fetchImpl = (...args) => fetch(...args), timeoutMs = 15000, onUnauthorized = () => {}, onSetupRequired = () => {} } = {}) {
  const base = baseUrl.replace(/\/$/, '')
  if (!base.startsWith('/') || base.startsWith('//') || base.includes('?') || base.includes('#')) throw new Error('Use a same-origin API path')
  return {
    async request(path, { method = 'GET', body, signal, anonymous = false, preserveSessionOnUnauthorized = false, responseType = 'json' } = {}) {
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
          if (response.status === 401 && !anonymous && !preserveSessionOnUnauthorized) onUnauthorized()
          let serverCode = ''
          if (response.headers.get('Content-Type')?.includes('application/json')) {
            try { serverCode = (await response.json())?.code ?? '' } catch { /* A malformed error is handled by the status fallback. */ }
          }
          // A gateway error, or a 5xx that is not the API's own JSON, means the server itself is unreachable.
          const unreachable = [502, 503, 504].includes(response.status) || (response.status >= 500 && !response.headers.get('Content-Type')?.includes('application/json'))
          if (unreachable) throw new HttpError(CONNECTION_LOST_MESSAGE, { status: response.status, code: 'network' })
          if (serverCode === 'PASSWORD_CHANGE_REQUIRED' || serverCode === 'PROFILE_SETUP_REQUIRED') onSetupRequired(serverCode)
          const setupMessages = { PASSWORD_CHANGE_REQUIRED: 'يجب إكمال تغيير كلمة المرور قبل استخدام النظام.', PROFILE_SETUP_REQUIRED: 'يجب إكمال بيانات الملف الشخصي قبل استخدام النظام.' }
          // Keep error copy consistent; never display arbitrary HTML/driver messages.
          const messages = { 400: 'البيانات المدخلة غير صالحة.', 401: preserveSessionOnUnauthorized ? 'كلمة المرور الحالية غير صحيحة أو انتهت الجلسة.' : anonymous ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : 'انتهت الجلسة. يرجى تسجيل الدخول.', 403: 'ليس لديك صلاحية لهذا الطلب.', 404: 'السجل غير موجود.', 409: 'تغيرت البيانات. حدّث الصفحة وحاول مجددًا.', 429: 'محاولات كثيرة. حاول مرة أخرى لاحقًا.' }
          throw new HttpError(setupMessages[serverCode] ?? messages[response.status] ?? 'تعذر إتمام الطلب. حاول مرة أخرى.', { status: response.status, code: serverCode || 'http', retryAfter: response.headers.get('Retry-After') })
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
        if (controller.signal.aborted) throw new HttpError(timedOut ? CONNECTION_LOST_MESSAGE : 'تم إلغاء الطلب.', { code: timedOut ? 'timeout' : 'aborted' })
        throw new HttpError(CONNECTION_LOST_MESSAGE)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    },
  }
}
