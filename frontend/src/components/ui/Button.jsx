export function Button({ as: Element = 'button', variant = 'primary', className = '', children, ...props }) {
  const variants = { primary: 'bg-primary-600 text-white hover:bg-primary-700', secondary: 'border border-border bg-surface text-ink hover:bg-primary-50 dark:hover:bg-primary-900/20', danger: 'bg-red-600 text-white hover:bg-red-700' }
  return <Element className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`} {...props}>{children}</Element>
}
