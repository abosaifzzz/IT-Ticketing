import {createContext,useContext} from 'react'

export const AdminAccessContext=createContext(null)
export const useAdminAccess=()=>useContext(AdminAccessContext)
