// Build-time replacement: production cannot load development credentials or demo authentication.
export const DEMO_PASSWORDS=Object.freeze({})
export const mockAuthProvider={
 login(){throw Error('المصادقة التجريبية غير متاحة.')},
 restoreSession(){return null},
 logout(){return Promise.resolve()},
}
