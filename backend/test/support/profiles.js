import assert from 'node:assert/strict'

// Established fictional accounts for workflow regression fixtures. Onboarding
// itself is exercised through HTTP in the dedicated profile integration suite.
export async function seedFixtureProfiles(pool,accounts,departments){
 const [[identity]]=await pool.query('SELECT DATABASE() db')
 assert.match(identity.db,/^hospital_it_helpdesk_test(?:_fresh_[a-f0-9]{12})?$/)
 for(const account of Object.values(accounts)){
  await pool.execute("UPDATE users SET phone='01000000000',must_complete_profile=FALSE,profile_completed_at=NOW(3) WHERE id=?",[account.id])
  for(const department of departments)await pool.execute('INSERT INTO user_departments(user_id,department_id) VALUES(?,?)',[account.id,department.id])
 }
}
export async function clearFixtureProfiles(pool,accounts){
 for(const account of Object.values(accounts))await pool.execute('DELETE FROM user_departments WHERE user_id=?',[account.id])
}
