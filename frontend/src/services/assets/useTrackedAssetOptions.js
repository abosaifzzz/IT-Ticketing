import {useState} from 'react'
import {useApiQuery} from '../http/useApiQuery'
import {assetManagementService} from './assetManagementService'

export function useTrackedAssetOptions(filters={}){
 const [search,setSearch]=useState(''),[page,setPage]=useState(1)
 const filterKey=JSON.stringify(filters)
 const query=useApiQuery(`tracked-option:${filterKey}:${search}:${page}`,signal=>assetManagementService.list('assets',{...filters,search,page,pageSize:25},signal))
 const updateSearch=value=>{setSearch(value);setPage(1)}
 return {search,page,setPage,updateSearch,query}
}
