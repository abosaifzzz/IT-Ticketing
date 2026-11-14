import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { parse } from 'dotenv'

export async function testEnvironment() {
  const file = process.env.HELPDESK_TEST_ENV ?? '.env.test'
  assert.ok(['.env.test', '.env.fresh.test'].includes(file), 'Only designated local test configurations are allowed')
  const env = parse(await readFile(new URL(`../../${file}`, import.meta.url)))
  assert.match(env.DB_NAME, file === '.env.test' ? /^hospital_it_helpdesk_test$/ : /^hospital_it_helpdesk_test_fresh_[a-f0-9]{12}$/)
  assert.equal(env.DB_HOST, '127.0.0.1'); assert.notEqual(env.DB_USER, 'root')
  return env
}
