import { Router } from 'express'
import { reqId, bad } from './validation.js'
export function createSimpleAssetRouter(repository) {
  const router = Router()
  router.get('/dashboard', async (req,res) => res.json(await repository.simpleDashboard(req.query,req.user)))
  for (const kind of ['types','assets','groups']) {
    router.get('/'+kind, async (req,res) => res.json(await repository.simpleList(kind,req.query,req.user)))
    router.get('/'+kind+'/:id', async (req,res) => res.json({item:await repository.simpleDetail(kind,reqId(req.params.id),req.user)}))
  }
  const operations = [
    ['post','/types','simpleTypeCreate'], ['patch','/types/:id','simpleTypeUpdate'], ['delete','/types/:id','simpleTypeDelete'],
    ['post','/assets','simpleAssetCreate'], ['patch','/assets/:id','simpleAssetUpdate'], ['delete','/assets/:id','simpleAssetDelete'],
    ['post','/assets/:id/condition','simpleAssetCondition'], ['post','/assets/:id/custody','simpleAssetCustody'],
    ['post','/groups','simpleGroupCreate'], ['patch','/groups/:id','simpleGroupUpdate'], ['delete','/groups/:id','simpleGroupDelete'],
    ['post','/groups/:id/members','simpleGroupAdd'], ['post','/groups/:id/remove-member','simpleGroupRemove'],
    ['post','/groups/:id/replace-member','simpleGroupReplace'], ['post','/groups/:id/custody','simpleGroupCustody'],
  ]
  for (const [method,path,operation] of operations) router[method](path,async(req,res)=>{
    if (req.body?.id !== undefined && req.params.id && req.body.id !== req.params.id) bad('Path/body ID mismatch')
    res.status(method==='post'?201:200).json({item:await repository.execute(operation,{...req.body,...req.params},req.user)})
  })
  return router
}
