import { reqId, filters, bad } from './validation.js'
import { requireIT } from './database.js'
import { simpleAsset, simpleGroup, simpleType, simpleConditions } from './simple.js'

const conditionSql = "CASE WHEN a.operational_status='IN_MAINTENANCE' THEN 'IN_MAINTENANCE' WHEN a.technical_condition='UNREPAIRABLE' THEN 'OUT_OF_SERVICE' WHEN a.technical_condition<>'GOOD' THEN 'FAULTY' ELSE a.usage_condition END"
const projection = 'a.*, t.name AS type_name, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name'
const joined = 'FROM am_assets a JOIN am_categories t ON t.id=a.category_id LEFT JOIN employee_directory e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN am_locations l ON l.id=a.location_id'
function selector(kind, query) {
  const extras = kind === 'assets' ? ['assetTypeId','condition','locationId','custodianType','custodianId','groupId','assigned','employeeId','departmentId','custodianSearch'] : kind === 'types' ? ['activeOnly'] : ['locationId','custodianType','custodianId']
  const f = filters(query, extras), where = [], values = []
  if (f.search.length > 200) bad()
  if (kind === 'assets') {
    where.push("a.archived_at IS NULL AND a.operational_status<>'RETIRED'")
    for (const [key, column] of [['assetTypeId','a.category_id'],['locationId','a.location_id'],['groupId','a.workstation_id'],['employeeId','a.employee_id'],['departmentId','a.department_id']]) if (f[key]) { where.push(column+'=?'); values.push(reqId(f[key])) }
    if (f.custodianSearch) { if(f.custodianSearch.length>200)bad();where.push('(LOCATE(?,COALESCE(e.full_name,\'\'))>0 OR LOCATE(?,COALESCE(d.name,\'\'))>0)');values.push(f.custodianSearch,f.custodianSearch) }
    if (f.condition) { if (!simpleConditions.includes(f.condition)) bad(); where.push(conditionSql+'=?'); values.push(f.condition) }
    if (f.custodianType) { if (!['employee','department','none'].includes(f.custodianType)) bad(); where.push('a.custodian_type=?'); values.push(f.custodianType) }
    if (f.custodianId) { where.push("(CASE WHEN a.custodian_type='employee' THEN a.employee_id ELSE a.department_id END)=?"); values.push(reqId(f.custodianId)) }
    if (f.assigned) { if (!['true','false'].includes(f.assigned)) bad(); where.push("a.custodian_type"+(f.assigned==='true'?"<>'none'":"='none'")) }
    if (f.search) { where.push("(LOCATE(?,CONVERT(a.asset_tag USING utf8mb4))>0 OR LOCATE(?,a.brand)>0 OR LOCATE(?,a.model)>0 OR LOCATE(?,COALESCE(a.serial_number,''))>0 OR LOCATE(?,t.name)>0 OR LOCATE(?,COALESCE(e.full_name,''))>0 OR LOCATE(?,COALESCE(d.name,''))>0)"); values.push(...Array(7).fill(f.search)) }
  } else if (kind === 'types') {
    if (f.activeOnly !== undefined && !['true','false'].includes(f.activeOnly)) bad()
    if (f.activeOnly === 'true') where.push('is_active=TRUE')
    if (f.search) { where.push('(LOCATE(?,name)>0 OR LOCATE(?,prefix)>0)'); values.push(f.search,f.search) }
  } else {
    where.push('archived_at IS NULL')
    if (f.locationId) { where.push('location_id=?'); values.push(reqId(f.locationId)) }
    if (f.custodianType) {
      if (!['employee','department','none'].includes(f.custodianType)) bad()
      where.push(f.custodianType === 'employee' ? 'employee_id IS NOT NULL' : f.custodianType === 'department' ? 'employee_id IS NULL AND department_id IS NOT NULL' : 'employee_id IS NULL AND department_id IS NULL')
    }
    if (f.custodianId) { where.push('COALESCE(employee_id,department_id)=?'); values.push(reqId(f.custodianId)) }
    if (f.search) { where.push("(LOCATE(?,name)>0 OR LOCATE(?,COALESCE(description,''))>0)"); values.push(f.search,f.search) }
  }
  if (f.from || f.to) {
    if (kind === 'groups') bad('Groups have no creation-date filter')
    const column = kind === 'assets' ? 'a.created_at' : 'created_at'
    if (f.from) { where.push(column+'>=?'); values.push(f.from) }
    if (f.to) { where.push(column+'<DATE_ADD(?,INTERVAL 1 DAY)'); values.push(f.to) }
  }
  return { f, values, where: where.length ? ' WHERE '+where.map(w=>'('+w+')').join(' AND ') : '' }
}
export function simpleReads(pool) {
  return {
    async simpleList(kind, query, user) {
      requireIT(user)
      if (!['assets','types','groups'].includes(kind)) bad('Unknown collection',404)
      const { f, where, values } = selector(kind,query)
      const from = kind === 'assets' ? joined : 'FROM '+(kind === 'types' ? 'am_categories' : 'am_workstations')
      const mapper = kind === 'assets' ? simpleAsset : kind === 'types' ? simpleType : simpleGroup
      const c = await pool.getConnection()
      try {
        await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        await c.beginTransaction()
        const [[count]] = await c.execute('SELECT COUNT(*) n '+from+where,values)
        const [rows] = await c.query('SELECT '+(kind==='assets'?projection:'*')+' '+from+where+' ORDER BY '+(kind==='assets'?'a.asset_tag,a.id':'name,id')+' LIMIT ? OFFSET ?', [...values,f.pageSize,(f.page-1)*f.pageSize])
        await c.commit()
        return { items:rows.map(mapper),total:Number(count.n),page:f.page,pageSize:f.pageSize }
      } catch(e) { await c.rollback(); throw e } finally { c.release() }
    },
    async simpleDetail(kind, id, user) {
      requireIT(user); reqId(id)
      if (!['assets','types','groups'].includes(kind)) bad('Unknown collection',404)
      const c = await pool.getConnection()
      try {
        await c.beginTransaction()
        const [[row]] = await c.execute(kind==='assets'?'SELECT '+projection+' '+joined+' WHERE a.id=? AND a.archived_at IS NULL':'SELECT * FROM '+(kind==='types'?'am_categories':'am_workstations')+' WHERE id=?'+(kind==='groups'?' AND archived_at IS NULL':''),[id])
        if (!row) bad('Record not found',404)
        const result = kind==='assets'?simpleAsset(row):kind==='types'?simpleType(row):simpleGroup(row)
        if (kind==='assets') {
          const [history] = await c.execute('SELECT id,type AS action,actor_id AS userId,created_at AS timestamp,previous_state AS oldValues,new_state AS newValues,reason AS notes,replacement_id AS replacementId FROM am_movements WHERE asset_id=? ORDER BY created_at,id',[id])
          const [assignments] = await c.execute('SELECT * FROM am_custody WHERE asset_id=? ORDER BY issued_at,id',[id])
          const [memberships] = await c.execute('SELECT * FROM am_group_memberships WHERE asset_id=? ORDER BY joined_at,id',[id])
          const view=value=>{if(typeof value==='string')value=JSON.parse(value);return value?.asset_tag?simpleAsset(value):value};
          Object.assign(result,{history:history.map(h=>({...h,oldValues:view(h.oldValues),newValues:view(h.newValues)})),assignments,memberships})
        } else if (kind==='groups') {
          const [members] = await c.execute('SELECT '+projection+' '+joined+' WHERE a.workstation_id=? AND a.archived_at IS NULL ORDER BY a.asset_tag',[id])
          const [history] = await c.execute('SELECT * FROM am_group_memberships WHERE group_id=? ORDER BY joined_at,id',[id])
          const [changes] = await c.execute("SELECT * FROM am_audit WHERE entity_type='workstation' AND entity_id=? ORDER BY created_at,id",[id])
          const [replacements]=await c.execute('SELECT DISTINCT r.* FROM am_replacements r JOIN am_movements m ON m.replacement_id=r.id JOIN am_group_memberships gm ON gm.asset_id=m.asset_id AND m.created_at>=gm.joined_at AND (gm.ended_at IS NULL OR m.created_at<=gm.ended_at) WHERE gm.group_id=? ORDER BY r.created_at,r.id',[id]);
          const [definitions]=await c.execute('SELECT * FROM am_group_components WHERE group_id=? AND removed_at IS NULL ORDER BY added_at,id',[id])
          const pending=[]
          for(const definition of definitions)if(!definition.allocated_asset_id){
            const [[source]]=await c.execute('SELECT '+projection+' '+joined+' WHERE a.id=?',[definition.source_asset_id])
            if(source)pending.push({...simpleAsset(source),quantity:1,componentId:definition.id,stockAssetId:source.id,availableQuantity:source.custodian_type==='none'&&!source.workstation_id?source.quantity:0,pending:true,groupId:id})
          }
          Object.assign(result,{members:[...members.map(simpleAsset),...pending],components:definitions,membershipHistory:history,replacementHistory:replacements,history:changes})
        }
        await c.commit(); return result
      } catch(e) { await c.rollback(); throw e } finally { c.release() }
    },
    async simpleDashboard(query,user) {
      requireIT(user)
      const {where,values}=selector('assets',query)
      const c=await pool.getConnection()
      try {
        await c.beginTransaction()
        const [[total]]=await c.execute('SELECT COALESCE(SUM(a.quantity),0) n '+joined+where,values)
        const [[summary]]=await c.execute("SELECT COALESCE(SUM(CASE WHEN a.custodian_type='employee' THEN a.quantity ELSE 0 END),0) employeeCustody,COALESCE(SUM(CASE WHEN a.custodian_type='department' THEN a.quantity ELSE 0 END),0) departmentCustody,COALESCE(SUM(CASE WHEN a.custodian_type='none' THEN a.quantity ELSE 0 END),0) unassigned,COALESCE(SUM(CASE WHEN "+conditionSql+" IN ('FAULTY','OUT_OF_SERVICE') THEN a.quantity ELSE 0 END),0) faulty,COALESCE(SUM(CASE WHEN a.operational_status='IN_MAINTENANCE' THEN a.quantity ELSE 0 END),0) inMaintenance "+joined+where,values)
        const [byType]=await c.execute('SELECT a.category_id AS assetTypeId,t.name,SUM(a.quantity) count '+joined+where+' GROUP BY a.category_id,t.name ORDER BY t.name',values)
        const [byCondition]=await c.execute('SELECT '+conditionSql+' AS `condition`,SUM(a.quantity) count '+joined+where+' GROUP BY `condition`',values)
        const [byAssignment]=await c.execute('SELECT a.custodian_type AS custodianType,SUM(a.quantity) count '+joined+where+' GROUP BY a.custodian_type',values)
        const [byLocation]=await c.execute('SELECT a.location_id AS locationId,SUM(a.quantity) count '+joined+where+' GROUP BY a.location_id',values)
        await c.commit()
        return {total:Number(total.n),totalUnits:Number(total.n),...Object.fromEntries(Object.entries(summary).map(([key,value])=>[key,Number(value)])),byType:byType.map(row=>({...row,count:Number(row.count)})),byCondition:byCondition.map(row=>({...row,count:Number(row.count)})),byAssignment:byAssignment.map(row=>({...row,count:Number(row.count)})),byLocation:byLocation.map(row=>({...row,count:Number(row.count)}))}
      } catch(e) { await c.rollback();throw e } finally {c.release()}
    },
  }
}
