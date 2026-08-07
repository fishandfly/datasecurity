import crypto from 'node:crypto'

const [rawUrl, accessKey, scenario] = process.argv.slice(2)
if (!rawUrl || !scenario) {
  console.error('usage: node scripts/call-v3-data-api.mjs <url> <subject-code> <scenario>')
  process.exit(2)
}

const secret = process.env.SUBJECT_SECRET
if (!secret || secret.length < 32) throw new Error('SUBJECT_SECRET must contain at least 32 characters')

const url = new URL(rawUrl)
const canonicalParams = [...url.searchParams.entries()]
  .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
const canonicalQuery = new URLSearchParams(canonicalParams).toString().replace(/\+/g, '%20')
const authMode = process.env.API_AUTH_MODE || 'api-key'
const headers = { 'X-Scenario': scenario }
if (authMode === 'api-key') {
  headers['X-API-Key'] = secret
} else {
  const timestamp = process.env.REQUEST_TIMESTAMP || String(Date.now())
  const nonce = process.env.REQUEST_NONCE || crypto.randomBytes(18).toString('base64url')
  const bodyDigest = crypto.createHash('sha256').update('').digest('hex')
  const canonical = ['GET', url.pathname, canonicalQuery, bodyDigest, timestamp, nonce].join('\n')
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex')
  if (process.env.DEBUG_CANONICAL === '1') console.error(crypto.createHash('sha256').update(canonical).digest('hex'), canonical)
  Object.assign(headers, { 'X-Access-Key': accessKey, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature })
}

const response = await fetch(url, {
  headers,
})
const text = await response.text()
let body = text
try { body = JSON.parse(text) } catch {}
console.log(JSON.stringify({ status: response.status, requestId: response.headers.get('x-request-id'), body }, null, 2))
if (!response.ok) process.exit(1)
