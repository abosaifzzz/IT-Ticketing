import {readFileSync} from 'node:fs'
export function productionGuard() {
  return {name:'exclude-development-credentials',apply:'build',generateBundle(_options,bundle){
    const credentials=Object.values(JSON.parse(readFileSync(new URL('../src/services/auth/demoCredentials.js',import.meta.url),'utf8').match(/Object.freeze\(([\s\S]*?)\)/)[1]))
    for(const output of Object.values(bundle)) {
      if(output.type!=='chunk')continue
      if(Object.keys(output.modules).some(path=>/\/(demoCredentials|mockAuthProvider)\.js$/.test(path.replaceAll('\\','/'))))this.error('Development authentication module included in production bundle')
      if(credentials.some(value=>output.code.includes(value)))this.error('Development credential included in production bundle')
    }
  }}
}
