import { Activity, ArrowLeft, Check, Database, Palette, RadioTower, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLayoutEffect, useMemo, useState } from 'react'
import { usePortalContext } from '../../../lib/portal-context'
import { cn } from '../../../lib/utils'
import { CockpitPanel } from '../components/cockpit-panel'
import { buildCockpitCategoryMetrics, buildCockpitDepartmentMetrics, buildCockpitMetrics } from '../lib/cockpit-metrics'
import { cockpitThemeOptions, normalizeCockpitThemeMode, type CockpitThemeMode } from '../lib/cockpit-theme'

const cockpitPageStyles: Record<CockpitThemeMode, {
  root: string
  backgroundGrid: string
  backLink: string
  title: string
  subtitle: string
  meta: string
  metricTile: string
  metricLabel: string
  metricValue: string
  metricHint: string
  metricAccent: string[]
  barLabel: string
  barTrack: string
  barFill: string
  barValue: string
  empty: string
  capabilityCard: string
  capabilityIcon: string
  capabilityTitle: string
  capabilityHint: string
  statusCard: string
  statusLabel: string
  statusValue: string
  switcherShell: string
  switcherButton: string
  switcherLabel: string
  switcherOption: string
  switcherOptionActive: string
}> = {
  dark: {
    root: 'bg-[radial-gradient(circle_at_50%_0%,rgba(17,73,120,0.62),transparent_34%),linear-gradient(180deg,#071426,#030712_70%)] text-[#d8f3ff]',
    backgroundGrid: 'bg-[linear-gradient(90deg,rgba(65,232,255,0.08)_1px,transparent_1px),linear-gradient(rgba(65,232,255,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-45',
    backLink: 'border-[#174467] bg-[#071427] text-[#9fc9df] hover:border-[#42e8ff] hover:text-white',
    title: 'text-white [text-shadow:0_0_24px_rgba(66,232,255,0.18)]',
    subtitle: 'text-[#79a8c4]',
    meta: 'text-[#7da7c0]',
    metricTile: 'border-[#173e5f] bg-[#071427]',
    metricLabel: 'text-[#7da7c0]',
    metricValue: 'text-white',
    metricHint: 'text-[#6d8ca4]',
    metricAccent: ['#42e8ff', '#61ffb8', '#ffdc73', '#9fb4ff'],
    barLabel: 'text-[#9fc9df]',
    barTrack: 'bg-[#0d2842]',
    barFill: 'bg-[linear-gradient(90deg,#1aa8ff,#55f4ff)]',
    barValue: 'text-[#d8f3ff]',
    empty: 'border-[#143956] bg-[#071427] text-[#6d8ca4]',
    capabilityCard: 'border-[#143956] bg-[#071427]',
    capabilityIcon: 'text-[#42e8ff]',
    capabilityTitle: 'text-white',
    capabilityHint: 'text-[#7da7c0]',
    statusCard: 'border-[#143956] bg-[#071427]',
    statusLabel: 'text-[#7da7c0]',
    statusValue: 'text-[#61ffb8]',
    switcherShell: 'border-[#174467] bg-[rgba(7,20,39,0.92)] shadow-[0_18px_40px_rgba(0,0,0,0.34)] backdrop-blur-md',
    switcherButton: 'border-[#22577c] bg-[#071427] text-[#9fc9df] hover:border-[#42e8ff] hover:text-white',
    switcherLabel: 'text-[#7da7c0]',
    switcherOption: 'border-transparent text-[#9fc9df] hover:border-[#22577c] hover:bg-[#0d2842] hover:text-white',
    switcherOptionActive: 'border-[#42e8ff] bg-[rgba(66,232,255,0.14)] text-white',
  },
  ink: {
    root: "bg-[#f7f1e5] text-[#24342b] [font-family:'Noto_Serif_SC','Songti_SC','SimSun',serif]",
    backgroundGrid: 'bg-[linear-gradient(90deg,rgba(68,82,70,0.05)_1px,transparent_1px),linear-gradient(rgba(68,82,70,0.04)_1px,transparent_1px)] bg-[size:64px_64px] opacity-70',
    backLink: 'border-[#c8bda7] bg-[rgba(255,253,247,0.72)] text-[#3d4a3f] shadow-[0_10px_24px_rgba(83,73,55,0.10)] hover:border-[#53614f] hover:text-[#16241c]',
    title: 'text-[#1f2e26] [text-shadow:0_1px_0_rgba(255,255,255,0.76)]',
    subtitle: 'text-[#687163]',
    meta: 'text-[#65705f]',
    metricTile: 'border-[#cfc4ad] bg-[linear-gradient(180deg,rgba(255,253,247,0.86),rgba(246,241,229,0.88))] shadow-[0_16px_34px_rgba(83,73,55,0.10)]',
    metricLabel: 'text-[#6a7568]',
    metricValue: 'text-[#17261e]',
    metricHint: 'text-[#7c7b6e]',
    metricAccent: ['#3d4a3f', '#668879', '#9b3126', '#b08b46'],
    barLabel: 'text-[#3f4c42]',
    barTrack: 'bg-[#e3dac8]',
    barFill: 'bg-[linear-gradient(90deg,#36483d,#7f9b8b)]',
    barValue: 'text-[#203128]',
    empty: 'border-[#d8cfba] bg-[rgba(255,253,247,0.56)] text-[#8a8678]',
    capabilityCard: 'border-[#d7cdb8] bg-[rgba(255,253,247,0.62)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42)]',
    capabilityIcon: 'text-[#405345]',
    capabilityTitle: 'text-[#1f2e26]',
    capabilityHint: 'text-[#71786b]',
    statusCard: 'border-[#d7cdb8] bg-[rgba(255,253,247,0.62)]',
    statusLabel: 'text-[#71786b]',
    statusValue: 'text-[#9b3126]',
    switcherShell: 'border-[#c8bda7] bg-[rgba(255,253,247,0.88)] shadow-[0_18px_40px_rgba(74,68,54,0.16)] backdrop-blur-md',
    switcherButton: 'border-[#c8bda7] bg-[rgba(255,253,247,0.78)] text-[#3d4a3f] hover:border-[#53614f] hover:text-[#16241c]',
    switcherLabel: 'text-[#687163]',
    switcherOption: 'border-transparent text-[#526156] hover:border-[#c8bda7] hover:bg-[#eee5d5] hover:text-[#16241c]',
    switcherOptionActive: 'border-[#3d4a3f] bg-[rgba(61,74,63,0.10)] text-[#16241c]',
  },
}

const cockpitThemeToneClasses: Record<CockpitThemeMode, string> = {
  dark: 'bg-[linear-gradient(135deg,#0b1d34,#42e8ff)]',
  ink: 'bg-[linear-gradient(135deg,#f8f1df,#3d4a3f_70%,#9b3126)]',
}

function MetricTile({
  label,
  value,
  hint,
  index,
  themeMode,
}: {
  label: string
  value: string
  hint: string
  index: number
  themeMode: CockpitThemeMode
}) {
  const styles = cockpitPageStyles[themeMode]
  const accent = styles.metricAccent[index % styles.metricAccent.length]

  return (
    <div className={cn('px-4 py-4', styles.metricTile)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={cn('text-[0.75rem] tracking-[0.12em]', styles.metricLabel)}>{label}</div>
          <div className={cn('mt-3 text-[2rem] font-semibold leading-none', styles.metricValue)}>{value}</div>
        </div>
        <span className="h-8 w-1" style={{ backgroundColor: accent, boxShadow: `0 0 18px ${accent}` }} />
      </div>
      <div className={cn('mt-3 text-[0.75rem]', styles.metricHint)}>{hint}</div>
    </div>
  )
}

function RankingBars({ items, themeMode }: { items: Array<{ label: string; value: number }>; themeMode: CockpitThemeMode }) {
  const styles = cockpitPageStyles[themeMode]
  const maxValue = Math.max(...items.map((item) => item.value), 1)

  if (items.length === 0) {
    return <div className={cn('border px-4 py-6 text-center text-[0.8125rem]', styles.empty)}>暂无可展示数据</div>
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-[0.75rem]">
          <div className={cn('truncate', styles.barLabel)} title={item.label}>{item.label}</div>
          <div className={cn('h-2', styles.barTrack)}>
            <div
              className={cn('h-full', styles.barFill)}
              style={{ width: `${Math.max(8, (item.value / maxValue) * 100)}%` }}
            />
          </div>
          <div className={cn('text-right font-semibold', styles.barValue)}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function RadarView({ themeMode }: { themeMode: CockpitThemeMode }) {
  const isInk = themeMode === 'ink'
  const points = [
    ['资源', '92%', 'left-[50%] top-[6%] -translate-x-1/2'],
    ['应用', '76%', 'right-[9%] top-[35%]'],
    ['共享', '68%', 'right-[20%] bottom-[9%]'],
    ['安全', '84%', 'left-[20%] bottom-[9%]'],
    ['运行', '72%', 'left-[9%] top-[35%]'],
  ] as const

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[430px]">
      <div className={cn('absolute inset-[8%] border', isInk ? 'border-[#8d947f]/50' : 'border-[#174a70]')} />
      <div className={cn('absolute inset-[20%] border', isInk ? 'border-[#9fa58f]/42' : 'border-[#174a70]/80')} />
      <div className={cn('absolute inset-[32%] border', isInk ? 'border-[#b4ad99]/55' : 'border-[#174a70]/60')} />
      <div className={cn('absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2', isInk ? 'bg-[#9fa58f]/48' : 'bg-[#123d5f]')} />
      <div className={cn('absolute left-[8%] top-1/2 h-px w-[84%] -translate-y-1/2', isInk ? 'bg-[#9fa58f]/48' : 'bg-[#123d5f]')} />
      <div
        className={cn(
          'absolute inset-[18%]',
          isInk
            ? 'bg-[conic-gradient(from_20deg,rgba(54,72,61,0.16),rgba(155,49,38,0.08),rgba(102,136,121,0.15),rgba(176,139,70,0.10),rgba(54,72,61,0.16))]'
            : 'bg-[conic-gradient(from_20deg,rgba(66,232,255,0.22),rgba(97,255,184,0.18),rgba(255,220,115,0.16),rgba(159,180,255,0.20),rgba(66,232,255,0.22))]',
        )}
      />
      <div
        className={cn(
          'absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border',
          isInk
            ? 'border-[#516352] bg-[rgba(255,253,247,0.72)] shadow-[0_18px_36px_rgba(83,73,55,0.12)]'
            : 'border-[#42e8ff] bg-[#06172d] shadow-[0_0_32px_rgba(66,232,255,0.22)]',
        )}
      >
        <RadioTower className={cn('h-7 w-7', isInk ? 'text-[#405345]' : 'text-[#42e8ff]')} />
        <div className={cn('mt-2 text-[0.75rem]', isInk ? 'text-[#596858]' : 'text-[#9fc9df]')}>综合态势</div>
      </div>
      {points.map(([label, value, className]) => (
        <div key={label} className={`absolute ${className}`}>
          <div
            className={cn(
              'border px-3 py-2 text-center',
              isInk
                ? 'border-[#cfc4ad] bg-[rgba(255,253,247,0.78)] shadow-[0_10px_24px_rgba(83,73,55,0.10)]'
                : 'border-[#1b5579] bg-[#071427] shadow-[0_10px_24px_rgba(0,0,0,0.28)]',
            )}
          >
            <div className={cn('text-[0.75rem]', isInk ? 'text-[#596858]' : 'text-[#9fc9df]')}>{label}</div>
            <div className={cn('mt-1 text-[1rem] font-semibold', isInk ? 'text-[#1f2e26]' : 'text-white')}>{value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function InkBackdrop() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(52,72,61,0.10),transparent_34%),linear-gradient(180deg,rgba(255,253,247,0.82),rgba(238,230,211,0.86))]" />
      <div aria-hidden className="pointer-events-none absolute left-[-8vw] bottom-[9vh] h-[34vh] w-[58vw] bg-[rgba(62,76,65,0.18)] blur-[1px] [clip-path:polygon(0_88%,12%_44%,25%_62%,39%_26%,54%_48%,69%_18%,86%_58%,100%_38%,100%_100%,0_100%)]" />
      <div aria-hidden className="pointer-events-none absolute right-[-4vw] bottom-[14vh] h-[28vh] w-[46vw] bg-[rgba(82,100,86,0.12)] blur-[2px] [clip-path:polygon(0_62%,14%_36%,31%_50%,45%_18%,61%_42%,75%_24%,100%_58%,100%_100%,0_100%)]" />
      <div aria-hidden className="pointer-events-none absolute left-[12vw] top-[17vh] h-10 w-[38vw] bg-[linear-gradient(90deg,transparent,rgba(83,94,80,0.12),transparent)] blur-md" />
      <div aria-hidden className="pointer-events-none absolute right-[16vw] top-[26vh] h-12 w-[30vw] bg-[linear-gradient(90deg,transparent,rgba(83,94,80,0.10),transparent)] blur-md" />
      <div aria-hidden className="pointer-events-none absolute right-16 top-24 hidden h-24 w-20 items-center justify-center border border-[#9b3126]/60 text-[1.25rem] font-semibold leading-tight text-[#9b3126] opacity-80 xl:flex">
        数治
      </div>
    </>
  )
}

function CockpitThemeSwitcher({
  themeMode,
  onThemeModeChange,
}: {
  themeMode: CockpitThemeMode
  onThemeModeChange: (themeMode: CockpitThemeMode) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const styles = cockpitPageStyles[themeMode]

  return (
    <div
      className="fixed right-4 top-1/2 z-50 -translate-y-1/2"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false)
        }
      }}
    >
      <div
        className={cn(
          'flex flex-row-reverse items-center overflow-hidden rounded-l-[999px] border py-1 pr-1 transition-[width,box-shadow,background-color,border-color] duration-300 ease-out',
          isOpen ? 'w-[19rem] pl-2' : 'w-12 pl-1',
          styles.switcherShell,
        )}
      >
        <button
          type="button"
          aria-label="切换驾驶舱风格"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition', styles.switcherButton)}
        >
          <Palette className="h-4 w-4" />
        </button>

        <div className={cn('overflow-hidden transition-all duration-300 ease-out', isOpen ? 'mr-2 w-[15.5rem] opacity-100' : 'mr-0 w-0 opacity-0')}>
          <div className="flex items-center gap-1">
            <span className={cn('whitespace-nowrap px-2 text-[0.6875rem] font-medium', styles.switcherLabel)}>界面风格</span>
            {cockpitThemeOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                tabIndex={isOpen ? 0 : -1}
                onClick={() => {
                  onThemeModeChange(value)
                  setIsOpen(false)
                }}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[0.6875rem] font-medium transition',
                  themeMode === value ? styles.switcherOptionActive : styles.switcherOption,
                )}
              >
                <span className={cn('h-2.5 w-2.5 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.36)]', cockpitThemeToneClasses[value])} />
                <span>{label}</span>
                {themeMode === value ? <Check className="h-3 w-3" /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CockpitPage() {
  const { data, isLoading, error } = usePortalContext()
  const [themeMode, setThemeMode] = useState<CockpitThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark'
    return normalizeCockpitThemeMode(window.localStorage.getItem('cockpit-theme-mode'))
  })
  const metrics = useMemo(() => buildCockpitMetrics(data.catalogItems), [data.catalogItems])
  const categoryMetrics = useMemo(() => buildCockpitCategoryMetrics(data.catalogItems), [data.catalogItems])
  const departmentMetrics = useMemo(() => buildCockpitDepartmentMetrics(data.catalogItems), [data.catalogItems])
  const styles = cockpitPageStyles[themeMode]
  const capabilityItems: Array<{ label: string; icon: LucideIcon; hint: string }> = [
    { label: '资源管控', icon: Database, hint: '目录、文档、数据源统一管理' },
    { label: '安全管控', icon: ShieldCheck, hint: '分类分级、字段安全、共享策略' },
    { label: '运行监督', icon: Activity, hint: '统计任务、运维信息、分析报告' },
  ]

  useLayoutEffect(() => {
    window.localStorage.setItem('cockpit-theme-mode', themeMode)
  }, [themeMode])

  return (
    <div className={cn('relative min-h-screen overflow-hidden px-6 py-5', styles.root)}>
      {themeMode === 'ink' ? <InkBackdrop /> : null}
      <div aria-hidden className={cn('pointer-events-none absolute inset-0', styles.backgroundGrid)} />
      <div className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1920px] flex-col gap-4">
        <header className="grid items-center gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_16rem]">
          <Link to="/" className={cn('inline-flex h-10 w-fit items-center gap-2 border px-3 text-[0.8125rem] transition', styles.backLink)}>
            <ArrowLeft className="h-4 w-4" />
            返回门户
          </Link>
          <div className="text-center">
            <h1 className={cn('text-[2rem] font-semibold tracking-[0.18em]', styles.title)}>数据治理综合驾驶舱</h1>
            <div className={cn('mt-2 text-[0.75rem] tracking-[0.22em]', styles.subtitle)}>RESOURCE · APPLICATION · SECURITY · SHARING · OPERATION</div>
          </div>
          <div className={cn('text-left text-[0.75rem] leading-6 xl:text-right', styles.meta)}>
            <div>{new Date().toLocaleDateString('zh-Hans-CN')}</div>
            <div>{isLoading ? '数据同步中' : error ? '数据异常' : '数据已同步'}</div>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <MetricTile key={metric.label} {...metric} index={index} themeMode={themeMode} />
          ))}
        </section>

        <section className="grid flex-1 gap-4 xl:grid-cols-[1fr_1.28fr_1fr]">
          <div className="space-y-4">
            <CockpitPanel title="资源分类排行" themeMode={themeMode}>
              <RankingBars items={categoryMetrics} themeMode={themeMode} />
            </CockpitPanel>
            <CockpitPanel title="管控能力" themeMode={themeMode}>
              <div className="grid gap-3">
                {capabilityItems.map(({ label, icon: RenderIcon, hint }) => {
                  return (
                    <div key={label} className={cn('flex items-center gap-3 border px-3 py-3', styles.capabilityCard)}>
                      <RenderIcon className={cn('h-5 w-5', styles.capabilityIcon)} />
                      <div>
                        <div className={cn('text-[0.875rem] font-semibold', styles.capabilityTitle)}>{label}</div>
                        <div className={cn('mt-1 text-[0.75rem]', styles.capabilityHint)}>{hint}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CockpitPanel>
          </div>

          <CockpitPanel title="五域综合态势" themeMode={themeMode} className="min-h-[520px]">
            <RadarView themeMode={themeMode} />
          </CockpitPanel>

          <div className="space-y-4">
            <CockpitPanel title="责任单位覆盖" themeMode={themeMode}>
              <RankingBars items={departmentMetrics} themeMode={themeMode} />
            </CockpitPanel>
            <CockpitPanel title="运行监督摘要" themeMode={themeMode}>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ['运行', '稳定'],
                  ['共享', '可控'],
                  ['安全', '在管'],
                ].map(([label, value]) => (
                  <div key={label} className={cn('border px-3 py-5', styles.statusCard)}>
                    <div className={cn('text-[0.75rem]', styles.statusLabel)}>{label}</div>
                    <div className={cn('mt-3 text-[1.25rem] font-semibold', styles.statusValue)}>{value}</div>
                  </div>
                ))}
              </div>
            </CockpitPanel>
          </div>
        </section>
      </div>
      <CockpitThemeSwitcher themeMode={themeMode} onThemeModeChange={setThemeMode} />
    </div>
  )
}
