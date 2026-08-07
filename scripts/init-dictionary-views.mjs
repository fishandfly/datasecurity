import { readFileSync } from 'node:fs'
import pg from 'pg'

const sql = readFileSync('/init/dictionary-views.sql', 'utf8')
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
})

try {
  await client.connect()
  await client.query(sql)
  console.log('[init-data] 字典数据库视图创建完成')
} finally {
  await client.end()
}
