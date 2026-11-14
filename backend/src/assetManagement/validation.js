import {ApiError, fields, text, uuid} from '../management/validation.js'
export const conditions=['GOOD','FAULTY','UNDER_INSPECTION','UNREPAIRABLE']
export const statuses=['IN_USE','AVAILABLE','RESERVED','IN_MAINTENANCE','RETIRED']
export const bad=(message='Invalid asset-management input',status=400)=>{throw new ApiError(status,message)}
export const str=(max=160,required=false)=>(value)=>!required&&(value===undefined||value==='')?'':max>160?longText(value,max):text(value,max)
export const id=(value)=>value===undefined||value===null?null:uuid(value)
function longText(value,max){if(typeof value!=='string')bad();const result=value.trim().normalize('NFC');if(!result||result.length>max||[...result].some(c=>(c.charCodeAt(0)<32&&!['\n','\r','\t'].includes(c))||c.charCodeAt(0)===127))bad();return result}
export const reqId=(value)=>uuid(value)
export const integer=(min=0,max=1000000,fallback=0)=>(value)=>{if(value===undefined)return fallback;if(!Number.isSafeInteger(value)||value<min||value>max)bad();return value}
export const choice=(values,fallback)=>(value)=>{value??=fallback;if(value===null&&fallback===null)return null;if(!values.includes(value))bad();return value}
export const boolean=(value)=>{if(value===undefined)return true;if(typeof value!=='boolean')bad();return value}
export const day=(value)=>{if(value===undefined||value===null)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)bad();return value}
export const money=(value)=>{if(value==null)return null;if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,2})?$/.test(value))bad();return value}
export function input(body,spec){fields(body,[...Object.keys(spec),'clientRequestId']);if(typeof body.clientRequestId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(body.clientRequestId))bad('clientRequestId is required');const out={clientRequestId:body.clientRequestId};for(const [key,validate]of Object.entries(spec))out[key]=validate(body[key]);return out}
export function filters(query,extra=[]){if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(k=>!['search','page','pageSize','from','to',...extra].includes(k)))bad();for(const value of Object.values(query))if(typeof value!=='string')bad();const number=(value,fallback,max)=>{if(value===undefined)return fallback;if(!/^[1-9]\d*$/.test(value)||Number(value)>max)bad();return Number(value)};const from=day(query.from),to=day(query.to);if(from&&to&&from>to)bad();if(query.format&&!['csv','xlsx','pdf'].includes(query.format))bad();return {...query,search:query.search??'',page:number(query.page,1,1000000),pageSize:number(query.pageSize,25,100),from,to}}
export function normalizedSerial(value){return value.normalize('NFKC').trim().toUpperCase().replace(/\s+/g,'')}
export function assertServiceable(asset){if(asset.technical_condition!=='GOOD'||asset.operational_status!=='AVAILABLE'||asset.workstation_id||asset.custodian_type!=='none'||(asset.quantity??1)!==1)bad('Choose one individually tracked available unit',409)}
