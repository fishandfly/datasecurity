import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-[8px] text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[linear-gradient(180deg,var(--primary),var(--primary-strong))] px-5 py-2.5 text-white shadow-[0_10px_22px_rgba(45,120,184,0.20)] hover:translate-y-[-1px]',
        secondary: 'bg-[var(--surface-raised)] px-5 py-2.5 text-[var(--text-secondary)] ring-1 ring-[var(--line)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--text-main)]',
        ghost: 'px-3 py-2 text-[var(--text-secondary)] hover:bg-[var(--surface-tint)] hover:text-[var(--text-main)]',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[10px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] p-6 shadow-[var(--shadow-soft)] backdrop-blur',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-xs font-medium text-[var(--status-info-text)]',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function ScenicPanel({
  className,
  children,
  hideRail = false,
}: PropsWithChildren<{ className?: string; hideRail?: boolean }>) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[12px] border border-[var(--line)] bg-[linear-gradient(135deg,var(--panel-bg-start),var(--panel-bg-end))] shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--panel-grid-v)_0_1px,transparent_1px_108px),linear-gradient(var(--panel-grid-h)_0_1px,transparent_1px_108px)] opacity-40" />
      <div className="pointer-events-none absolute right-[-42px] top-[-36px] h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(var(--panel-orb-rgb),0.10),transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-[linear-gradient(180deg,transparent,rgba(var(--theme-support-rgb),0.08))]" />
      <div className="pointer-events-none absolute left-6 right-6 top-18 hidden opacity-70 lg:block">
        <svg viewBox="0 0 900 80" className="h-20 w-full">
          <path
            d="M0 56C67 61 99 21 157 16C198 12 247 32 300 45C365 61 432 61 485 42C542 23 589 3 651 7C726 12 769 50 837 55C860 57 879 56 900 52"
            fill="none"
            stroke="rgba(var(--panel-orb-rgb),0.20)"
            strokeWidth="2.4"
          />
          <path
            d="M0 68C78 58 130 48 199 49C275 50 326 70 397 67C485 64 563 31 637 29C716 27 789 57 900 61"
            fill="none"
            stroke="rgba(var(--theme-support-rgb),0.18)"
            strokeWidth="1.6"
          />
        </svg>
      </div>
      {!hideRail ? (
        <div className="absolute left-0 top-0 h-full w-1 bg-[linear-gradient(180deg,var(--panel-rail-start),var(--panel-rail-end))]" />
      ) : null}
      <div className="relative h-full">{children}</div>
    </section>
  )
}

export function TopicPill({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        'rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1 text-[0.75rem] text-[var(--text-secondary)] shadow-[0_4px_10px_rgba(48,93,152,0.04)]',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatCard({
  className,
  title,
  value,
  tone = 'blue',
  icon,
  hideRail = false,
}: {
  className?: string
  title: string
  value: string
  tone?: 'blue' | 'green'
  icon?: React.ReactNode
  hideRail?: boolean
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4', className)}>
      {!hideRail ? (
        <div className={cn('absolute left-0 top-0 h-full w-1', tone === 'green' ? 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--theme-accent)_82%,white),var(--primary-strong))]' : 'bg-[linear-gradient(180deg,var(--theme-accent),var(--primary))]')} />
      ) : null}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            tone === 'green' ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'bg-[rgba(var(--theme-soft-rgb),0.10)] text-[var(--primary)]',
          )}
        >
          {icon}
        </div>
        <div>
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{value}</div>
        </div>
      </div>
    </div>
  )
}
