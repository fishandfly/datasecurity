export type CockpitThemeMode = 'dark' | 'ink'

export const cockpitThemeOptions: Array<{ value: CockpitThemeMode; label: string }> = [
  { value: 'dark', label: '暗色' },
  { value: 'ink', label: '水墨' },
]

export function normalizeCockpitThemeMode(value: string | null | undefined): CockpitThemeMode {
  if (value === 'dark' || value === 'ink') return value
  return 'dark'
}
