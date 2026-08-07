import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './ui'
import { toErrorMessage } from '../lib/nocobase-client'
import {
  DEFAULT_RESOURCE_INGEST_VALIDATION_CONFIG,
  fetchResourceIngestValidationConfig,
  saveResourceIngestValidationConfig,
  type ResourceIngestValidationConfig,
} from '../lib/resource-ingest-validation'

const inputClassName = 'h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.8125rem] text-[var(--text-main)] outline-none transition focus:border-[var(--primary)]'

function splitFields(value: string) {
  return Array.from(new Set(value.split(/[,，、\n\r]+/).map((item) => item.trim()).filter(Boolean)))
}

function formatRanges(ranges: Record<string, [number, number]>) {
  return Object.entries(ranges).map(([field, range]) => `${field}=${range[0]},${range[1]}`).join('\n')
}

function parseRanges(value: string) {
  const result: Record<string, [number, number]> = {}
  value.split(/[\n\r;；]+/).map((item) => item.trim()).filter(Boolean).forEach((line) => {
    const [fieldPart, rangePart = ''] = line.split('=')
    const [minimumPart, maximumPart] = rangePart.split(/[,，]/)
    const field = fieldPart.trim()
    const minimum = Number(minimumPart)
    const maximum = Number(maximumPart)
    if (!field || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
      throw new Error(`数值范围格式错误：${line}`)
    }
    result[field] = [minimum, maximum]
  })
  return result
}

export function ResourceIngestValidationDialog({
  open,
  resourceId,
  availableFields,
  onClose,
  onSaved,
}: {
  open: boolean
  resourceId: string
  availableFields: string[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [form, setForm] = useState<ResourceIngestValidationConfig>(DEFAULT_RESOURCE_INGEST_VALIDATION_CONFIG)
  const [requiredFieldsText, setRequiredFieldsText] = useState('')
  const [duplicateKeysText, setDuplicateKeysText] = useState('')
  const [checksumFieldsText, setChecksumFieldsText] = useState('')
  const [numericRangesText, setNumericRangesText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !resourceId) return
    let cancelled = false
    setIsLoading(true)
    setError('')
    void fetchResourceIngestValidationConfig(resourceId)
      .then((config) => {
        if (cancelled) return
        setForm(config)
        setRequiredFieldsText(config.requiredFields.join('、'))
        setDuplicateKeysText(config.duplicateKeys.join('、'))
        setChecksumFieldsText(config.checksumFields.join('、'))
        setNumericRangesText(formatRanges(config.numericRanges))
      })
      .catch((currentError) => {
        if (!cancelled) setError(toErrorMessage(currentError, '读取资源接入校验配置失败'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, resourceId])

  if (!open) return null

  const update = <K extends keyof ResourceIngestValidationConfig>(key: K, value: ResourceIngestValidationConfig[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async () => {
    setIsSaving(true)
    setError('')
    try {
      const digestField = form.digestField.trim()
      if (form.integrityMode === 'digest_field' && !digestField) throw new Error('启用摘要字段校验时必须填写摘要字段')
      const nextConfig: ResourceIngestValidationConfig = {
        ...form,
        requiredFields: splitFields(requiredFieldsText),
        duplicateKeys: splitFields(duplicateKeysText),
        checksumFields: splitFields(checksumFieldsText),
        numericRanges: parseRanges(numericRangesText),
        digestField,
      }
      await saveResourceIngestValidationConfig(resourceId, nextConfig)
      await onSaved()
      onClose()
    } catch (currentError) {
      setError(toErrorMessage(currentError, '保存资源接入校验配置失败'))
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="资源接入校验配置">
      <div className="max-h-[90dvh] w-full max-w-[760px] overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
        <header className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-[1.125rem] font-semibold text-[var(--text-main)]">资源接入校验配置</h2>
            <p className="mt-1 text-[0.75rem] leading-5 text-[var(--text-secondary)]">数据源规则作为默认值，当前配置只覆盖本数据资源。</p>
          </div>
          <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>

        <div className="max-h-[calc(90dvh-140px)] space-y-5 overflow-y-auto px-5 py-5">
          {isLoading ? <div className="py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取配置...</div> : (
            <>
              <section className="space-y-3">
                <h3 className="text-[0.875rem] font-semibold text-[var(--text-main)]">字段与抽样规则</h3>
                <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
                  <span>继承数据源字段校验规则</span>
                  <input type="checkbox" checked={form.inheritSourceRules} onChange={(event) => update('inheritSourceRules', event.target.checked)} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>必填字段</span><input className={inputClassName} value={requiredFieldsText} onChange={(event) => setRequiredFieldsText(event.target.value)} placeholder="POINT_CODE、DATA_TIME" /></label>
                  <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>联合去重键</span><input className={inputClassName} value={duplicateKeysText} onChange={(event) => setDuplicateKeysText(event.target.value)} placeholder="POINT_CODE、DATA_TIME" /></label>
                </div>
                <label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]">
                  <span>数值范围（每行一项）</span>
                  <textarea className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]" value={numericRangesText} onChange={(event) => setNumericRangesText(event.target.value)} placeholder={'ACTIVE_POWER=-1000,1000\nVOLTAGE=0,500'} />
                </label>
                <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
                  <span>覆盖数据源抽样设置</span>
                  <input type="checkbox" checked={form.samplingOverride} onChange={(event) => update('samplingOverride', event.target.checked)} />
                </label>
                {form.samplingOverride ? <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]"><span>启用抽样</span><input type="checkbox" checked={form.samplingEnabled} onChange={(event) => update('samplingEnabled', event.target.checked)} /></label>
                  <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>抽样率（%）</span><input type="number" min="1" max="100" className={inputClassName} value={form.samplingRate} onChange={(event) => update('samplingRate', Number(event.target.value))} /></label>
                </div> : null}
              </section>

              <section className="space-y-3 border-t border-[var(--line)] pt-5">
                <h3 className="text-[0.875rem] font-semibold text-[var(--text-main)]">资源完整性校验</h3>
                <label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>校验方式</span><select className={inputClassName} value={form.integrityMode} onChange={(event) => update('integrityMode', event.target.value as ResourceIngestValidationConfig['integrityMode'])}><option value="inherit">继承数据源配置</option><option value="digest_field">按资源摘要字段校验</option><option value="disabled">本资源关闭完整性校验</option></select></label>
                {form.integrityMode === 'digest_field' ? <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>摘要算法</span><select className={inputClassName} value={form.checksumAlgorithm} onChange={(event) => update('checksumAlgorithm', event.target.value as ResourceIngestValidationConfig['checksumAlgorithm'])}><option>SM3</option><option>SHA-256</option></select></label>
                    <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>摘要字段</span><input className={inputClassName} value={form.digestField} onChange={(event) => update('digestField', event.target.value)} placeholder="DATA_DIGEST" list="resource-ingest-fields" /></label>
                  </div>
                  <label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>参与摘要的字段</span><input className={inputClassName} value={checksumFieldsText} onChange={(event) => setChecksumFieldsText(event.target.value)} placeholder="留空表示除摘要字段外的全部资源字段" /></label>
                  <label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>校验失败动作</span><select className={inputClassName} value={form.integrityFailureAction} onChange={(event) => update('integrityFailureAction', event.target.value as ResourceIngestValidationConfig['integrityFailureAction'])}><option value="reject">拒绝该记录</option><option value="warn">仅告警，不拒绝</option></select></label>
                  <div className="rounded-[8px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-3 text-[0.75rem] leading-5 text-[var(--status-info-text)]">摘要原文按字段名排序后序列化为紧凑 JSON，再使用 UTF-8 计算摘要。来源端必须采用相同口径。</div>
                </> : null}
              </section>

              {availableFields.length ? <datalist id="resource-ingest-fields">{availableFields.map((field) => <option key={field} value={field} />)}</datalist> : null}
            </>
          )}
          {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button disabled={isLoading || isSaving} onClick={() => void submit()}>{isSaving ? '正在保存...' : '保存资源规则'}</Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
