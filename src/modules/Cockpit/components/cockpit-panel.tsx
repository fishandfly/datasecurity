import type { PropsWithChildren, ReactNode } from 'react'
import { cn } from '../../../lib/utils'
import type { CockpitThemeMode } from '../lib/cockpit-theme'

const cockpitPanelStyles: Record<CockpitThemeMode, {
  root: string
  topLine: string
  header: string
  marker: string
  title: string
  body: string
}> = {
  dark: {
    root: 'border-[#174467] bg-[linear-gradient(180deg,rgba(8,21,42,0.92),rgba(5,13,28,0.96))] shadow-[0_18px_42px_rgba(0,0,0,0.34)]',
    topLine: 'bg-[linear-gradient(90deg,transparent,#58d5ff,transparent)] opacity-70',
    header: 'border-[#123353]',
    marker: 'h-2 w-2 bg-[#40e0ff] shadow-[0_0_14px_rgba(64,224,255,0.9)]',
    title: 'text-[#d8f3ff]',
    body: '',
  },
  ink: {
    root: 'border-[#cfc4ad] bg-[linear-gradient(180deg,rgba(255,253,247,0.88),rgba(246,241,229,0.94))] shadow-[0_18px_42px_rgba(74,68,54,0.12)] backdrop-blur-sm',
    topLine: 'bg-[linear-gradient(90deg,transparent,rgba(52,67,57,0.44),transparent)] opacity-80',
    header: 'border-[#ded5c1]',
    marker: 'h-2 w-5 rounded-full bg-[#3d4a3f] shadow-[8px_0_18px_rgba(61,74,63,0.16)]',
    title: 'text-[#25332b]',
    body: 'text-[#344239]',
  },
}

export function CockpitPanel({
  title,
  action,
  themeMode = 'dark',
  className,
  children,
}: PropsWithChildren<{ title: string; action?: ReactNode; themeMode?: CockpitThemeMode; className?: string }>) {
  const styles = cockpitPanelStyles[themeMode]

  return (
    <section
      className={cn(
        'relative overflow-hidden border',
        styles.root,
        className,
      )}
    >
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-px', styles.topLine)} />
      <div className={cn('relative flex items-center justify-between gap-3 border-b px-4 py-3', styles.header)}>
        <div className="flex items-center gap-2">
          <span className={styles.marker} />
          <h2 className={cn('text-[0.875rem] font-semibold tracking-[0.08em]', styles.title)}>{title}</h2>
        </div>
        {action}
      </div>
      <div className={cn('relative p-4', styles.body)}>{children}</div>
    </section>
  )
}
