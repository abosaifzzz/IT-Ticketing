import {useState} from 'react'
import {useApiQuery} from '../http/useApiQuery'
import {employeeDirectoryService} from '../employees/employeeDirectoryService'

export function useAssetPeopleOptions(){
 const [search,setSearch]=useState(''),[page,setPage]=useState(1)
 const employees=useApiQuery(`asset-people:${search}:${page}`,signal=>employeeDirectoryService.list(search,page,signal))
 const departments=useApiQuery('asset-departments',signal=>employeeDirectoryService.departments(signal))
 const updateSearch=value=>{setSearch(value);setPage(1)}
 return {search,updateSearch,page,setPage,employees,departments}
}
