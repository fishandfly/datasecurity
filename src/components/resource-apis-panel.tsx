import { Check, Clipboard, Code2, ExternalLink, Power, PowerOff, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toErrorMessage } from '../lib/nocobase-client'
import { formatSecurityV3Value, listSecurityV3Records, type SecurityV3Record } from '../lib/nocobase-security-v3'
import { ensureDefaultSecurityApi, publishSecurityApi, unpublishSecurityApi } from '../lib/security-runtime-client'

type ResourceApisPanelProps = {
  resourceId: string
  canManage: boolean
}

type ParameterItem = {
  name: string
  type: string
  required: boolean
  defaultValue: string
  description: string
}

type ExampleLanguage = 'curl' | 'python' | 'javascript'

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parseList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function parameterDescription(name: string) {
  const descriptions: Record<string, string> = {
    regionCode: '区域编码，用于限定查询数据所属区域。',
    organizationCode: '组织编码，用于访问策略范围校验。',
    startAt: '查询开始时间，推荐使用 ISO 8601 格式。',
    endAt: '查询结束时间，推荐使用 ISO 8601 格式。',
    pointId: '量测点标识，用于查询指定测点。',
  }
  return descriptions[name] || `自定义查询参数 ${name}，将代入数据资源定义的只读 SQL。`
}

function valueType(value: unknown) {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  return 'string'
}

function displayDateTime(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? '尚未上线' : date.toLocaleString('zh-CN', { hour12: false })
}

function buildExampleUrl(accessUrl: string, parameters: ParameterItem[]) {
  const values = new URLSearchParams()
  parameters.forEach((parameter) => {
    if (parameter.name === 'page') return
    if (parameter.name === 'pageSize') {
      values.set(parameter.name, '10')
      return
    }
    if (parameter.name === 'fields') return
    values.set(parameter.name, parameter.defaultValue || `{${parameter.name}}`)
  })
  const query = values.toString().replace(/%7B/g, '{').replace(/%7D/g, '}')
  return query ? `${accessUrl}?${query}` : accessUrl
}

function CopyButton({ value, label = '复制' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
      {copied ? '已复制' : label}
    </button>
  )
}

export function ResourceApisPanel({ resourceId, canManage }: ResourceApisPanelProps) {
  const [api, setApi] = useState<SecurityV3Record | null>(null)
  const [scenarios, setScenarios] = useState<string[]>([])
  const [scenario, setScenario] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isActing, setIsActing] = useState(false)
  const [language, setLanguage] = useState<ExampleLanguage>('curl')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const ensured = canManage ? await ensureDefaultSecurityApi(resourceId) : null
      const records = await listSecurityV3Records('security_api_resources', {
        filter: ensured?.id ? { id: ensured.id } : { resource_id: resourceId },
        appends: ['data_source'],
        sort: ['id'],
      })
      const currentApi = records[0] ?? null
      setApi(currentApi)
      if (currentApi?.id) {
        const policies = await listSecurityV3Records('eco_resource_security_policies', {
          filter: { api_resource_id: currentApi.id, policy_kind: 'access_policy', policy_status: 'enabled', publish_status: 'success' },
          sort: ['policy_code'],
        })
        const availableScenarios = Array.from(new Set(policies.map((item) => String(item.scenario || '').trim()).filter(Boolean)))
        setScenarios(availableScenarios)
        setScenario((current) => availableScenarios.includes(current) ? current : availableScenarios[0] || '')
      } else {
        setScenarios([])
        setScenario('')
      }
    } catch (currentError) {
      setApi(null)
      setError(toErrorMessage(currentError, '读取数据服务通道信息失败'))
    } finally {
      setIsLoading(false)
    }
  }, [canManage, resourceId])

  useEffect(() => {
    void load()
  }, [load])

  const runtimeConfig = useMemo(() => parseObject(api?.runtime_config_json), [api?.runtime_config_json])
  const defaultParams = useMemo(
    () => parseObject(runtimeConfig.defaultParams ?? runtimeConfig.default_params),
    [runtimeConfig],
  )
  const queryParams = useMemo(
    () => parseList(runtimeConfig.queryParams ?? runtimeConfig.query_params),
    [runtimeConfig],
  )
  const defaultFields = useMemo(
    () => parseList(runtimeConfig.defaultFields ?? runtimeConfig.default_fields),
    [runtimeConfig],
  )
  const parameters = useMemo<ParameterItem[]>(() => [
    ...Array.from(new Set([...(String(runtimeConfig.regionFieldCode || runtimeConfig.region_field_code || '').trim() ? ['regionCode'] : []), ...queryParams])).map((name) => ({
      name,
      type: valueType(defaultParams[name]),
      required: name === 'regionCode' || defaultParams[name] === undefined || defaultParams[name] === null || defaultParams[name] === '',
      defaultValue: defaultParams[name] === undefined ? '' : String(defaultParams[name]),
      description: parameterDescription(name),
    })),
    { name: 'page', type: 'integer', required: false, defaultValue: '1', description: '分页页码，从 1 开始。' },
    { name: 'pageSize', type: 'integer', required: false, defaultValue: '100', description: '每页返回数量，最终受访问策略限制，最大不超过 1000。' },
    { name: 'fields', type: 'string', required: false, defaultValue: defaultFields.join(','), description: '指定输出字段，多个字段编码使用英文逗号分隔；留空返回默认字段。' },
  ], [defaultFields, defaultParams, queryParams, runtimeConfig.regionFieldCode, runtimeConfig.region_field_code])

  const gatewayPath = String(api?.gateway_path || '')
  const isStreaming = ['stream_subscription', 'topic_consumer'].includes(String(api?.channel_type || 'query_service'))
  const accessUrl = gatewayPath
    ? `${window.location.origin}/security-runtime-api${gatewayPath}`
    : ''
  const subscriptionUrl = accessUrl ? `${accessUrl}/subscribe` : ''
  const subscriptionExampleUrl = subscriptionUrl ? `${subscriptionUrl}?regionCode={regionCode}` : ''
  const exampleUrl = useMemo(() => buildExampleUrl(accessUrl, parameters), [accessUrl, parameters])
  const examples = useMemo<Record<ExampleLanguage, string>>(() => {
    const scenarioHeader = scenario || '{已发布场景}'
    const url = isStreaming ? subscriptionExampleUrl : exampleUrl
    const method = isStreaming ? 'POST' : 'GET'
    return {
      curl: [`curl --request ${method} '${url}' \\`, "  --header 'X-API-Key: $API_KEY' \\", `  --header 'X-Scenario: ${scenarioHeader}'`].join('\n'),
      python: `import os\nimport requests\n\nurl = '${url}'\nheaders = {\n    'X-API-Key': os.environ['API_KEY'],\n    'X-Scenario': '${scenarioHeader}',\n}\n\nresponse = requests.${isStreaming ? 'post' : 'get'}(url, headers=headers, timeout=30)\nresponse.raise_for_status()\nprint(response.json())`,
      javascript: `const response = await fetch('${url}', {\n  method: '${method}',\n  headers: {\n    'X-API-Key': process.env.API_KEY,\n    'X-Scenario': '${scenarioHeader}',\n  },\n})\n\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`)\nconsole.log(await response.json())`,
    }
  }, [exampleUrl, isStreaming, scenario, subscriptionExampleUrl])

  const isOnline = api?.api_status === 'enabled' && api?.publish_status === 'success'
  const runAction = async (action: 'publish' | 'unpublish') => {
    if (!api?.id) return
    setIsActing(true)
    setError('')
    setNotice('')
    try {
      if (action === 'publish') {
        const result = await publishSecurityApi(String(api.id))
        setNotice(`数据服务通道已上线，当前版本 V${result.publishVersion}`)
      } else {
        await unpublishSecurityApi(String(api.id))
        setNotice('数据服务通道已下线，服务地址已停止提供。')
      }
      await load()
    } catch (currentError) {
      setError(toErrorMessage(currentError, action === 'publish' ? '服务通道上线失败' : '服务通道下线失败'))
    } finally {
      setIsActing(false)
    }
  }

  if (isLoading && !api) {
    return <div className="rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在生成并读取数据服务通道...</div>
  }

  if (!api) {
    return (
      <div className="rounded-[14px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-5 text-[0.875rem] leading-7 text-[var(--status-warning-text)]">
        {error || '完整维护数据资源、基准物理表和字段后，系统将自动生成查询服务通道。'}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      {notice ? <div className="rounded-[10px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-success-text)]">{notice}</div> : null}

      <section className="overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--surface-outline)] bg-[linear-gradient(135deg,var(--surface-tint),var(--surface-muted))] px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--primary)] px-3 py-1 font-mono text-[0.75rem] font-bold text-white">{String(api.http_method || 'GET')}</span>
                <span className={`rounded-full border px-3 py-1 text-[0.75rem] font-semibold ${isOnline ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'}`}>
                  {isOnline ? '已上线' : '未上线'}
                </span>
                <span className="text-[0.75rem] text-[var(--text-muted)]">V{Number(api.publish_version || 0)}</span>
              </div>
              <h3 className="mt-3 text-[1.25rem] font-semibold text-[var(--text-main)]">{String(api.api_name || '资源查询服务通道')}</h3>
              <div className="mt-1 font-mono text-[0.75rem] text-[var(--text-muted)]">{String(api.api_code || '')}</div>
            </div>
            {canManage ? (
              <button
                type="button"
                disabled={isActing}
                onClick={() => void runAction(isOnline ? 'unpublish' : 'publish')}
                className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-[0.8125rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isOnline ? 'border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] hover:brightness-95' : 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_10px_22px_rgba(var(--theme-strong-rgb),0.2)] hover:-translate-y-[1px]'}`}
              >
                {isActing ? <RefreshCw className="h-4 w-4 animate-spin" /> : isOnline ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                {isOnline ? '通道下线' : '通道上线'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[0.8125rem] font-semibold text-[var(--text-secondary)]">
              <ExternalLink className="h-4 w-4 text-[var(--primary)]" />
              {isStreaming ? '受控订阅地址' : '查询服务地址'}
            </div>
            <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[0.8125rem] text-[var(--text-main)]">{isStreaming ? subscriptionExampleUrl : accessUrl}</code>
              <CopyButton value={isStreaming ? subscriptionExampleUrl : accessUrl} />
            </div>
            <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">网关相对路径：<code>{gatewayPath}</code>；{isStreaming ? '数据所属区域策略已启用时，订阅请求必须传入 regionCode。' : ''}生产环境请将当前站点域名替换为实际安全网关域名。</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['通道类型', formatSecurityV3Value(api.channel_type || 'query_service')],
              [isStreaming ? '订阅模式' : '请求方法', isStreaming ? formatSecurityV3Value(api.subscription_mode || 'push') : String(api.http_method || 'GET')],
              ['最近上线', displayDateTime(api.published_at)],
              [isStreaming ? '流式主题' : '关联数据源', isStreaming ? String(api.topic_name || '未配置') : formatSecurityV3Value(api.data_source)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-3">
                <div className="text-[0.6875rem] text-[var(--text-muted)]">{label}</div>
                <div className="mt-1 text-[0.8125rem] font-semibold leading-6 text-[var(--text-main)]">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!isStreaming ? <section className="rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-[1rem] font-semibold text-[var(--text-main)]">请求参数说明</h3>
        </div>
        <div className="mt-4 divide-y divide-[var(--surface-outline)] overflow-hidden rounded-[12px] border border-[var(--surface-outline)]">
          {parameters.map((parameter) => (
            <div key={parameter.name} className="grid gap-3 bg-[var(--surface-raised)] px-4 py-4 md:grid-cols-[180px_110px_minmax(0,1fr)]">
              <div>
                <code className="font-mono text-[0.8125rem] font-semibold text-[var(--primary)]">{parameter.name}</code>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[0.6875rem] text-[var(--text-muted)]">{parameter.type}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] ${parameter.required ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]' : 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]'}`}>{parameter.required ? '必填' : '可选'}</span>
                </div>
              </div>
              <div>
                <div className="text-[0.6875rem] text-[var(--text-muted)]">默认值</div>
                <div className="mt-1 break-all font-mono text-[0.75rem] text-[var(--text-secondary)]">{parameter.defaultValue || '无'}</div>
              </div>
              <div className="text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{parameter.description}</div>
            </div>
          ))}
        </div>
      </section> : (
        <section className="rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-[var(--primary)]" /><h3 className="text-[1rem] font-semibold text-[var(--text-main)]">订阅配置</h3></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{[['流式主题', String(api.topic_name || '未配置')], ['消费组', String(api.consumer_group || '未配置')], ['订阅模式', formatSecurityV3Value(api.subscription_mode || 'push')]].map(([label, value]) => <div key={label} className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-3"><div className="text-[0.6875rem] text-[var(--text-muted)]">{label}</div><div className="mt-1 break-all font-mono text-[0.8125rem] font-semibold text-[var(--text-main)]">{value}</div></div>)}</div>
        </section>
      )}

      <section className="rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
              <h3 className="text-[1rem] font-semibold text-[var(--text-main)]">访问鉴权</h3>
            </div>
            <div className="mt-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">调用方需要获得当前服务通道授权，并在请求头中传入 API Key 和已发布的调用场景。{isStreaming ? '订阅建立与后续续租均经过策略校验；系统不在此处保存或返回消息中台凭据。' : <>配置数据所属区域的策略还必须显式传入 <code>regionCode</code>。</>}</div>
          </div>
          <div className="grid gap-2 text-[0.75rem] sm:min-w-[360px]">
            <code className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[var(--text-main)]">X-API-Key: $API_KEY</code>
            {scenarios.length ? <select aria-label="调用场景" value={scenario} onChange={(event) => setScenario(event.target.value)} className="h-10 rounded-[8px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-3 font-mono text-[0.75rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]">{scenarios.map((item) => <option key={item} value={item}>X-Scenario: {item}</option>)}</select> : <code className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[var(--text-main)]">X-Scenario: {'{已发布场景}'}</code>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--surface-outline)] bg-[var(--surface-muted)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-[var(--primary)]" />
            <h3 className="text-[1rem] font-semibold text-[var(--text-main)]">访问示例代码</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['curl', 'python', 'javascript'] as ExampleLanguage[]).map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setLanguage(item)}
                className={`rounded-full px-3 py-1.5 text-[0.75rem] font-semibold transition ${language === item ? 'bg-[var(--primary)] text-white shadow-[var(--shadow-soft)]' : 'border border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--primary)]'}`}
              >
                {item === 'curl' ? 'cURL' : item === 'python' ? 'Python' : 'JavaScript'}
              </button>
            ))}
          </div>
        </div>
        <div className="relative bg-[var(--code-bg,#091422)] p-5">
          <div className="absolute right-4 top-4"><CopyButton value={examples[language]} label="复制代码" /></div>
          <pre className="overflow-x-auto pr-24 text-[0.8125rem] leading-7 text-[#d7e8f7]"><code>{examples[language]}</code></pre>
        </div>
      </section>
    </div>
  )
}
