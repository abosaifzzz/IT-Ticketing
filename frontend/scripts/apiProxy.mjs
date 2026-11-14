// Bind cancellation before headers too: a page can leave while stream authentication is pending.
export function configureApiProxy(proxy) {
  const bind = (upstream, request, response) => {
    if (request.url?.split('?')[0].endsWith('/notifications/stream')) {
      const close = () => upstream.destroy()
      if (response.destroyed) { close(); return }
      response.once('close', close)
      upstream.once('close', () => response.removeListener('close', close))
    }
  }
  proxy.on('proxyReq', bind)
  proxy.on('proxyRes', bind)
}
