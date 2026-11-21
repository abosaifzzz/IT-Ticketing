import { ApiError } from '../management/validation.js'
import {recordAudit} from '../administration/audit.js'
import {saveDepartments} from '../auth/profiles.js'

export function createMySqlUserRepository(pool) {
  return {
    async findByEmail(email) {
      const [rows] = await pool.execute(
        'SELECT id, email, username, full_name, role, auth_provider, password_hash, is_active,admin_password_verified,must_change_password,must_complete_profile FROM users WHERE email = ? OR username = ? LIMIT 2',
        [email,email],
      )
      return rows.length===1?rows[0]:null
    },
    async createLocal({ id, email, fullName, role, passwordHash,mustCompleteProfile=role!=='admin' }) {
      const now = new Date()
      await pool.execute(
        'INSERT INTO users (id, email, full_name, role, auth_provider, password_hash, is_active, created_at, updated_at,admin_password_verified,must_complete_profile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)',
        [id, email, fullName, role, 'local', passwordHash, true, now, now,role==='admin',mustCompleteProfile],
      )
    },
    async changeOwnPassword(id,expectedHash,passwordHash,{adminStrongVerified=false,profile}={}) {
      const c=await pool.getConnection()
      try {
        await c.beginTransaction()
        const [[user]]=await c.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[id])
        if(!user?.is_active||user.auth_provider!=='local'||user.password_hash!==expectedHash)throw new ApiError(409,'Account changed; sign in again')
        if(user.role==='admin'&&!adminStrongVerified)throw new ApiError(400,'A strong administrator password is required')
        if(user.must_complete_profile&&!profile)throw new ApiError(403,'أكمل إعداد الحساب مع كلمة المرور والهاتف والأقسام.')
        if(profile){
          await saveDepartments(c,id,profile.departmentIds)
          await c.execute('UPDATE users SET phone=?,must_complete_profile=FALSE,profile_completed_at=NOW(3) WHERE id=?',[profile.phone,id])
        }
        await c.execute('UPDATE users SET password_hash=?,must_change_password=FALSE,password_changed_at=?,updated_at=?,admin_password_verified=? WHERE id=?',[passwordHash,new Date(),new Date(),user.role==='admin'&&adminStrongVerified,id])
        await c.execute('DELETE FROM auth_sessions WHERE user_id=?',[id])
        await recordAudit(c,{actor:{id,role:user.role},action:'authentication.self_change',module:'authentication',entityId:id,after:{requiresChange:false,sessionsRevoked:true}})
        await c.commit()
      }catch(error){await c.rollback();throw error}finally{c.release()}
    },
    async replaceLocalPassword(identifier, passwordHash,{adminStrongVerified=false}={}) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[user]] = await connection.execute('SELECT id, auth_provider,role FROM users WHERE email = ? OR username = ? FOR UPDATE', [identifier,identifier])
        if (!user || user.auth_provider !== 'local') throw new ApiError(404, 'الحساب المحلي غير موجود.')
        if(user.role==='admin'&&!adminStrongVerified)throw new ApiError(400,'A strong administrator password is required')
        await connection.execute('UPDATE users SET password_hash = ?, updated_at = ?,admin_password_verified=?,must_change_password=FALSE,password_changed_at=NOW(3) WHERE id = ?', [passwordHash, new Date(),user.role==='admin'&&adminStrongVerified, user.id])
        await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [user.id])
        await connection.commit()
        return { id: user.id }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
  }
}
