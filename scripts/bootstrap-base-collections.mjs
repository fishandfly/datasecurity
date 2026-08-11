import { APIClient } from '@nocobase/sdk'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeprecatedSecurityField } from './security-field-model.mjs'

const baseURL = process.env.NOCOBASE_API_BASE_URL || 'http://localhost:8196/api/'
const account = process.env.NOCOBASE_ADMIN_ACCOUNT || 'nocobase'
const password = process.env.NOCOBASE_ADMIN_PASSWORD || 'admin123'
const authenticator = process.env.NOCOBASE_AUTHENTICATOR || 'basic'
const client = new APIClient({ baseURL, storageType: 'memory' })

const specFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'base-collections-spec.json')
const spec = JSON.parse(readFileSync(specFile, 'utf8'))

function rows(payload) {
  return Array.isArray(payload?.data) ? payload.data : []
}

async function findOne(collection, filter) {
  const response = await client.resource(collection).list({ filter, page: 1, pageSize: 1 })
  return rows(response.data)[0] ?? null
}

async function listAll(collection, of, pageSize = 1000) {
  const result = []
  let page = 1
  for (;;) {
    const response = await client.resource(collection, of).list({ page, pageSize })
    const payload = response.data
    result.push(...rows(payload))
    const totalPage = Number(payload?.meta?.totalPage ?? 0)
    if (!totalPage || page >= totalPage) break
    page += 1
  }
  return result
}

async function main() {
  await client.auth.signIn({ account, password }, authenticator)

  let createdCollections = 0
  for (const collection of spec) {
    const existing = await findOne('collections', { name: collection.name })
    if (existing) continue
    await client.resource('collections').create({
      values: {
        name: collection.name,
        title: collection.title,
        description: collection.description,
        ...collection.options,
      },
    })
    createdCollections += 1
    console.log(`[bootstrap] 创建集合 ${collection.name}`)
  }

  let createdFields = 0
  for (const collection of spec) {
    const names = new Set((await listAll('collections.fields', collection.name)).map((item) => item.name))
    for (const field of collection.fields) {
      if (isDeprecatedSecurityField(collection.name, field.name)) continue
      if (names.has(field.name)) continue
      await client.resource('collections.fields', collection.name).create({ values: field })
      names.add(field.name)
      createdFields += 1
      console.log(`[bootstrap] 创建字段 ${collection.name}.${field.name}`)
    }
  }

  console.log(JSON.stringify({ baseCollections: spec.length, createdCollections, createdFields }, null, 2))
}

main().catch((error) => {
  console.error(error?.message || error)
  console.error(JSON.stringify(error?.response?.data || {}, null, 2))
  process.exit(1)
})
