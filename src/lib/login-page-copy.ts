export type LoginPageCopy = {
  heroTitle: string
  heroDescription: string
  formEyebrow: string
  formNotice: string
}

export function getLoginPageCopy(): LoginPageCopy {
  return {
    heroTitle: '登录后可提交数据申请事项、查看可访问目录',
    heroDescription:
      '目录服务系统面向厅机关、直属单位以及市县生态环境局用户开放。登录后可根据资源目录属性发起数据申请、跟踪处理状态、查看可访问资源范围。',
    formEyebrow: '',
    formNotice: '',
  }
}
