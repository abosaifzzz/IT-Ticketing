import mysql from 'mysql2/promise'

export function createPool(config) {
  return mysql.createPool({
    ...config,
    timezone: 'Z',
    supportBigNumbers: true,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: false,
  })
}
