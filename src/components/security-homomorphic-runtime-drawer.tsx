import { CheckCircle2, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  saveOpenFheEngineConfig,
  testOpenFheConnection,
  type OpenFheEngineConfig,
} from '../lib/nocobase-security-runtime'
import { toErrorMessage } from '../lib/nocobase-client'
import { cn } from '../lib/utils'
import { Button } from './ui'

const inputClassName = 'h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]'

function maskReference(value: string) {
  const normalized = value.trim()
  if (!normalized) return '未配置'
  const tail = normalized.split('/').filter(Boolean).at(-1) || normalized
  return `受控凭据 / ${tail.slice(0, 3)}***${tail.slice(-3)}`
}

export function SecurityHomomorphicRuntimeDrawer({
  open,
  config,
  onClose,
  onSaved,
}: {
  open: boolean
  config: OpenFheEngineConfig
  onClose: () => void
  onSaved: (config: OpenFheEngineConfig) => void
}) {
  const [form, setForm] = useState(config)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState<{ failed: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({ ...config, supportedAlgorithms: ['BFV', 'CKKS'] })
    setNotice(null)
  }, [config, open])

  if (!open) return null

  const check = async () => {
    setChecking(true)
    setNotice(null)
    try {
      const health = await testOpenFheConnection({ ...form, supportedAlgorithms: ['BFV', 'CKKS'] })
      setNotice({ failed: false, text: `连接正常，延迟 ${health.latencyMs} ms，检查时间 ${new Date().toLocaleString('zh-CN')}。` })
    } catch (error) {
      setNotice({ failed: true, text: toErrorMessage(error, '连接检查失败') })
    } finally {
      setChecking(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const saved = await saveOpenFheEngineConfig({ ...form, supportedAlgorithms: ['BFV', 'CKKS'] })
      onSaved(saved)
      setNotice({ failed: false, text: '运行配置已保存。' })
    } catch (error) {
      setNotice({ failed: true, text: toErrorMessage(error, '运行配置保存失败') })
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[rgba(8,18,32,0.46)]" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[620px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[-24px_0_64px_rgba(8,18,32,0.22)]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">同态任务</div>
            <h2 className="mt-1 text-[1.125rem] font-semibold text-[var(--text-main)]">运行配置</h2>
          </div>
          <button type="button" title="关闭" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <div className="text-[0.75rem] text-[var(--text-muted)]">服务状态</div>
              <div className="mt-2 flex items-center gap-2 font-medium text-[var(--text-main)]"><CheckCircle2 className="h-4 w-4 text-[var(--status-success-text)]" />{form.enabled ? '已启用' : '未启用'}</div>
            </div>
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <div className="text-[0.75rem] text-[var(--text-muted)]">计算能力</div>
              <div className="mt-2 font-medium text-[var(--text-main)]">整数精确与浮点近似</div>
              <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">支持求和与平均值</div>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[0.875rem] text-[var(--text-secondary)]">
            <span>启用密态计算服务</span>
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
              <span>认证方式</span>
              <select className={inputClassName} value={form.authMode} onChange={(event) => setForm((current) => ({ ...current, authMode: event.target.value as OpenFheEngineConfig['authMode'] }))}>
                <option value="mTLS">双向证书</option>
                <option value="token">令牌认证</option>
                <option value="none">内网免认证</option>
              </select>
            </label>
            <label className="space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
              <span>请求超时（秒）</span>
              <input type="number" min="1" max="300" className={inputClassName} value={form.timeoutSeconds} onChange={(event) => setForm((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))} />
            </label>
          </div>

          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
            <div className="text-[0.75rem] text-[var(--text-muted)]">凭据引用摘要</div>
            <div className="mt-1 text-[0.875rem] font-medium text-[var(--text-main)]">{maskReference(form.secretRef)}</div>
          </div>

          {notice ? <div className={cn('rounded-[8px] border px-4 py-3 text-[0.8125rem]', notice.failed ? 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]' : 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]')}>{notice.text}</div> : null}
        </div>

        <footer className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)] sm:flex sm:items-center sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>取消</Button>
          <Button variant="secondary" className="w-full gap-2 sm:w-auto" disabled={checking} onClick={() => void check()}><RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} />{checking ? '检查中...' : '检查连接'}</Button>
          <Button className="col-span-2 w-full sm:w-auto" disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存配置'}</Button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}
