import { Activity, PencilLine, RefreshCw, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toErrorMessage } from '../lib/nocobase-client'
import { formatSecurityV3Value, listSecurityV3Records, updateSecurityV3Record, type SecurityV3Record } from '../lib/nocobase-security-v3'
import {
  grantApiAuthorization,
  hasApiAuthorization,
  hasGlobalApiAuthorization,
  revokeApiAuthorization,
} from '../lib/resource-access-subjects'
import { ensureDefaultSecurityApi } from '../lib/security-runtime-client'
import { cn } from '../lib/utils'
import { ResourceBehaviorBaselineDialog } from './resource-behavior-baseline-dialog'

type ResourceAccessSubjectsPanelProps = {
  resourceId: string
  canManage: boolean
}

function statusTone(value: unknown) {
  if (value === 'enabled') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (value === 'disabled') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
}

export function ResourceAccessSubjectsPanel({ resourceId, canManage }: ResourceAccessSubjectsPanelProps) {
  const [api, setApi] = useState<SecurityV3Record | null>(null)
  const [subjects, setSubjects] = useState<SecurityV3Record[]>([])
  const [baselines, setBaselines] = useState<SecurityV3Record[]>([])
  const [baselineSubject, setBaselineSubject] = useState<SecurityV3Record | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)
  const [pendingRevokeId, setPendingRevokeId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const ensured = canManage ? await ensureDefaultSecurityApi(resourceId) : null
      const [apis, nextSubjects] = await Promise.all([
        listSecurityV3Records('security_api_resources', {
          filter: ensured?.id ? { id: ensured.id } : { resource_id: resourceId },
          sort: ['id'],
        }),
        listSecurityV3Records('security_access_subjects', { sort: ['subject_code', 'id'] }),
      ])
      const resolvedApi = apis[0] ?? null
      const nextBaselines = resolvedApi?.id
        ? await listSecurityV3Records('security_behavior_baselines', {
          filter: { api_resource_id: resolvedApi.id },
          sort: ['-baseline_version', '-updatedAt'],
        })
        : []
      setApi(resolvedApi)
      setSubjects(nextSubjects)
      setBaselines(nextBaselines)
    } catch (currentError) {
      setApi(null)
      setSubjects([])
      setBaselines([])
      setError(toErrorMessage(currentError, '读取数据资源数据应用失败'))
    } finally {
      setIsLoading(false)
    }
  }, [canManage, resourceId])

  useEffect(() => { void load() }, [load])

  const apiCode = String(api?.api_code || '').trim()
  const authorizedSubjects = useMemo(
    () => subjects.filter((subject) => hasApiAuthorization(subject.allowed_api_codes_json, apiCode)),
    [apiCode, subjects],
  )
  const availableSubjects = useMemo(
    () => subjects.filter((subject) => (
      subject.subject_status === 'enabled'
      && !hasApiAuthorization(subject.allowed_api_codes_json, apiCode)
    )),
    [apiCode, subjects],
  )
  const baselineBySubjectId = useMemo(() => new Map(
    baselines.map((baseline) => [String(baseline.subject_id || ''), baseline]),
  ), [baselines])

  useEffect(() => {
    if (selectedSubjectId && !availableSubjects.some((subject) => String(subject.id) === selectedSubjectId)) {
      setSelectedSubjectId('')
    }
  }, [availableSubjects, selectedSubjectId])

  const changeAuthorization = async (subjectId: string, action: 'grant' | 'revoke') => {
    if (!apiCode || !subjectId) return
    setIsActing(true)
    setError('')
    setNotice('')
    try {
      const latest = await listSecurityV3Records('security_access_subjects', { filter: { id: subjectId } })
      const subject = latest[0]
      if (!subject) throw new Error('数据应用不存在或已被删除')
      const allowedApiCodes = action === 'grant'
        ? grantApiAuthorization(subject.allowed_api_codes_json, apiCode)
        : revokeApiAuthorization(subject.allowed_api_codes_json, apiCode)
      await updateSecurityV3Record('security_access_subjects', subjectId, {
        allowed_api_codes_json: allowedApiCodes,
      })
      setNotice(action === 'grant'
        ? `已授权 ${String(subject.subject_name || subject.subject_code || '')} 访问当前资源 API。`
        : `已取消 ${String(subject.subject_name || subject.subject_code || '')} 对当前资源 API 的授权。`)
      setSelectedSubjectId('')
      setPendingRevokeId('')
      await load()
    } catch (currentError) {
      setError(toErrorMessage(currentError, action === 'grant' ? '数据应用授权失败' : '取消数据应用授权失败'))
    } finally {
      setIsActing(false)
    }
  }

  const revoke = (subject: SecurityV3Record) => {
    if (!subject.id || hasGlobalApiAuthorization(subject.allowed_api_codes_json)) return
    const subjectId = String(subject.id)
    if (pendingRevokeId !== subjectId) {
      setPendingRevokeId(subjectId)
      return
    }
    void changeAuthorization(subjectId, 'revoke')
  }

  if (isLoading && !api) {
    return <div className="rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取数据应用授权...</div>
  }

  if (!api) {
    return (
      <div className="rounded-[14px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-5 text-[0.875rem] leading-7 text-[var(--status-warning-text)]">
        {error || '当前数据资源尚未生成唯一查询 API，请先完整维护基准物理表和资源字段。'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--status-info-text)]">
        此处维护数据应用对当前资源唯一 API <span className="font-mono font-semibold">{apiCode}</span> 的授权和行为基线。每个“主体 + API”只有一条行为基线；授权后仍需存在已发布且场景匹配的访问策略，请求才会被放行。
      </div>

      {error ? <div className="rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      {notice ? <div className="rounded-[10px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-success-text)]">{notice}</div> : null}

      {canManage ? (
        <section className="rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-2 block text-[0.8125rem] font-medium text-[var(--text-secondary)]">选择待授权数据应用</span>
              <select
                value={selectedSubjectId}
                disabled={isActing || availableSubjects.length === 0}
                onChange={(event) => setSelectedSubjectId(event.target.value)}
                className="h-10 w-full rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] px-3 text-[0.8125rem] text-[var(--text-main)] outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{availableSubjects.length ? '请选择已启用且尚未授权的主体' : '没有可添加的已启用主体'}</option>
                {availableSubjects.map((subject) => (
                  <option key={String(subject.id)} value={String(subject.id)}>
                    {String(subject.subject_name || '未命名主体')}（{String(subject.subject_code || '-')}）
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedSubjectId || isActing}
              onClick={() => void changeAuthorization(selectedSubjectId, 'grant')}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 text-[0.8125rem] font-semibold text-white shadow-[0_10px_22px_rgba(var(--theme-strong-rgb),0.2)] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isActing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              添加数据应用
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-3">
          <div className="flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
            <Users className="h-4 w-4 text-[var(--primary)]" />已授权数据应用
            <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[0.75rem] text-[var(--primary)]">{authorizedSubjects.length}</span>
          </div>
          <button type="button" disabled={isLoading} onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />刷新
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1540px] border-collapse text-left text-[0.8125rem]">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <tr>{['主体编码', '主体名称', '主体类型', '所属组织', '授权方式', '主体状态', '行为基线', '平均调用频率', '平均查询跨度', '平均返回行数', '操作'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {authorizedSubjects.map((subject) => {
                const globalAuthorization = hasGlobalApiAuthorization(subject.allowed_api_codes_json)
                const confirmingRevoke = pendingRevokeId === String(subject.id)
                const baseline = baselineBySubjectId.get(String(subject.id))
                return (
                  <tr key={String(subject.id)} className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]">
                    <td className="px-4 py-3.5 font-mono font-medium text-[var(--text-main)]">{String(subject.subject_code || '-')}</td>
                    <td className="px-4 py-3.5 font-medium text-[var(--text-main)]">{String(subject.subject_name || '-')}</td>
                    <td className="px-4 py-3.5 text-[var(--text-secondary)]">{formatSecurityV3Value(subject.subject_type)}</td>
                    <td className="px-4 py-3.5 text-[var(--text-secondary)]">{String(subject.organization_name || subject.organization_code || '-')}</td>
                    <td className="px-4 py-3.5"><span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-2.5 py-1 text-[0.75rem] text-[var(--status-info-text)]"><ShieldCheck className="h-3.5 w-3.5" />{globalAuthorization ? '全部 API' : '当前资源 API'}</span></td>
                    <td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(subject.subject_status))}>{formatSecurityV3Value(subject.subject_status)}</span></td>
                    <td className="px-4 py-3.5">
                      {baseline ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-mono font-medium text-[var(--text-main)]"><Activity className="h-3.5 w-3.5 text-[var(--primary)]" />{String(baseline.baseline_code || '-')}</div>
                          <div className="flex items-center gap-2 text-[0.6875rem] text-[var(--text-muted)]">
                            <span className={cn('rounded-full border px-2 py-0.5', statusTone(baseline.baseline_status))}>{formatSecurityV3Value(baseline.baseline_status)}</span>
                            <span>V{Number(baseline.baseline_version || 1)} · {Number(baseline.sample_count || 0)} 个样本</span>
                          </div>
                        </div>
                      ) : <span className="text-[var(--text-muted)]">未配置</span>}
                    </td>
                    <td className="px-4 py-3.5 text-[var(--text-secondary)]">{baseline ? `${Number(baseline.frequency_avg || 0)} ± ${Number(baseline.frequency_stddev || 0)}` : '-'}</td>
                    <td className="px-4 py-3.5 text-[var(--text-secondary)]">{baseline ? `${Number(baseline.query_days_avg || 0)} ± ${Number(baseline.query_days_stddev || 0)} 天` : '-'}</td>
                    <td className="px-4 py-3.5 text-[var(--text-secondary)]">{baseline ? `${Number(baseline.rows_avg || 0)} ± ${Number(baseline.rows_stddev || 0)}` : '-'}</td>
                    <td className="px-4 py-3.5">
                      {canManage ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isActing}
                            title={baseline ? '编辑当前主体的行为基线' : '为当前主体配置行为基线'}
                            onClick={() => setBaselineSubject(subject)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 text-[0.75rem] font-medium text-[var(--status-info-text)] transition hover:brightness-95 disabled:opacity-50"
                          >
                            <PencilLine className="h-3.5 w-3.5" />{baseline ? '编辑基线' : '配置基线'}
                          </button>
                          <button
                            type="button"
                            disabled={isActing || globalAuthorization}
                            title={globalAuthorization ? '该主体使用全部 API 授权，请在数据应用页面调整' : confirmingRevoke ? '再次点击确认取消授权' : '取消当前资源 API 授权'}
                            onClick={() => revoke(subject)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 text-[0.75rem] font-medium text-[var(--status-danger-text)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <UserMinus className="h-3.5 w-3.5" />{confirmingRevoke ? '确认取消' : '取消授权'}
                          </button>
                          {confirmingRevoke ? (
                            <button type="button" disabled={isActing} onClick={() => setPendingRevokeId('')} className="h-8 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]">保留授权</button>
                          ) : null}
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && authorizedSubjects.length === 0 ? <div className="px-4 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">当前资源尚未授权任何数据应用</div> : null}
      </section>
      <ResourceBehaviorBaselineDialog
        open={Boolean(baselineSubject)}
        api={api}
        subject={baselineSubject}
        baseline={baselineSubject ? baselineBySubjectId.get(String(baselineSubject.id)) ?? null : null}
        onClose={() => setBaselineSubject(null)}
        onSaved={async (message) => { setNotice(message); await load() }}
      />
    </div>
  )
}
