import {createLocalAccountService as realAccountService} from '../../src/auth/localAccountService.js'

// These regression identities represent established, privately provisioned
// accounts. Dedicated HTTP tests cover creation with required onboarding.
export function createLocalAccountService(users){
 return realAccountService({...users,createLocal:input=>users.createLocal({...input,mustCompleteProfile:false})})
}
