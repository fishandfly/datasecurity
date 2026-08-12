import { Activity, Database, RefreshCw, ServerCog, ShieldCheck, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchSecurityRuntimeHealth, type SecurityRuntimeHealth } from '../lib/security-runtime-client'
import { Button } from './ui'

const serviceLabels: Array<[keyof SecurityRuntimeHealth['services'], string]> = [
  ['configuration', '配置读取'],
  ['dataAccess', '数据接入'],
  ['policyControl', '策略控制'],
  ['homomorphicComputation', '密态计算'],
]

export function SecurityRuntimeStatusAction() {
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<SecurityRuntimeHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const configurationMetrics: Array<[string, number, LucideIcon]> = [
    ['活动数据源', health?.configuration.sources ?? 0, Database],
    ['已发布服务通道', health?.configuration.apis ?? 0, ServerCog],
    ['已发布策略', health?.configuration.policies ?? 0, ShieldCheck],
    ['活动主体', health?.configuration.subjects ?? 0, Activity],
  ]

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      setHealth(await fetchSecurityRuntimeHealth())
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : '运行状态读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  return (
    <>
      <Button variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
        <ServerCog className="h-4 w-4" />运行状态
      </Button>
      {open ? createPortal(
        <div className="fixed inset-0 z-50 bg-[rgba(8,18,32,0.46)]" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false) }}>
          <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[520px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[-24px_0_64px_rgba(8,18,32,0.22)]">
            <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-6 py-4">
              <div>
                <h2 className="text-[1.125rem] font-semibold text-[var(--text-main)]">运行状态</h2>
                <p className="mt-1 text-[0.75rem] text-[var(--text-muted)]">检查统一接入、策略控制与密态计算链路</p>
              </div>
              <button type="button" title="关闭" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
              <div className="grid grid-cols-2 gap-3">
                {serviceLabels.map(([key, label]) => {
                  const ok = health?.services[key] === 'ok'
                  return (
                    <div key={key} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.8125rem] text-[var(--text-secondary)]">{label}</span>
                        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-[var(--status-success-text)]' : 'bg-[var(--status-danger-text)]'}`} />
                      </div>
                      <div className="mt-2 text-[0.95rem] font-semibold text-[var(--text-main)]">{health ? (ok ? '运行正常' : '暂不可用') : '检查中'}</div>
                    </div>
                  )
                })}
              </div>
              <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)]">
                <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-[0.875rem] font-semibold text-[var(--text-main)]"><Activity className="h-4 w-4 text-[var(--primary)]" />生效配置</div>
                <div className="grid grid-cols-2 gap-px bg-[var(--line)]">
                  {configurationMetrics.map(([label, value, Icon]) => (
                    <div key={String(label)} className="bg-[var(--surface)] p-4">
                      <Icon className="h-4 w-4 text-[var(--primary)]" />
                      <div className="mt-3 text-[1.35rem] font-semibold text-[var(--text-main)]">{String(value)}</div>
                      <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{String(label)}</div>
                    </div>
                  ))}
                </div>
              </section>
              {health?.checkedAt ? <div className="text-[0.75rem] text-[var(--text-muted)]">最近检查：{new Date(health.checkedAt).toLocaleString()}</div> : null}
            </div>
            <footer className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)] sm:flex sm:justify-end">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setOpen(false)}>关闭</Button>
              <Button className="w-full gap-2 sm:w-auto" disabled={loading} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />重新检查</Button>
            </footer>
          </aside>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
