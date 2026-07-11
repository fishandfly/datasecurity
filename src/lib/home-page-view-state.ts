export type HomeHeroNoticeState = {
  showAuthNotice: boolean
  showLoadingNotice: boolean
  errorMessage: string | null
}

export function getHomeHeroNotices(input: {
  authRequired: boolean
  isLoading: boolean
  error: string | null
}): HomeHeroNoticeState {
  return {
    showAuthNotice: false,
    showLoadingNotice: input.isLoading,
    errorMessage: input.error,
  }
}
