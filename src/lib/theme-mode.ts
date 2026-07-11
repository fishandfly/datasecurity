export type ThemeMode = 'blue' | 'green' | 'blue-white' | 'dark'
export type FontSizeMode = 'standard' | 'large' | 'largest'

export const themeModeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' },
  { value: 'blue-white', label: '蓝白' },
  { value: 'dark', label: '暗色' },
]

export const fontSizeModeOptions: Array<{ value: FontSizeMode; label: string }> = [
  { value: 'standard', label: '标准' },
  { value: 'large', label: '增大' },
  { value: 'largest', label: '最大' },
]

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  if (value === 'blue' || value === 'green' || value === 'blue-white' || value === 'dark') {
    return value
  }

  return 'blue-white'
}

export function normalizeFontSizeMode(value: string | null | undefined): FontSizeMode {
  if (value === 'standard' || value === 'large' || value === 'largest') {
    return value
  }

  return 'standard'
}
