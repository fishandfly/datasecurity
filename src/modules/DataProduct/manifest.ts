import { Database } from 'lucide-react'
import type { AppModuleManifest } from '../types'

export const DataProductManifest: AppModuleManifest = {
  id: 'data-product',
  title: '数据产品',
  shortTitle: '数据产品',
  description: '将加工后的数据按产品形态配置检索视图、外部 API 接入、可视化组件和嵌入式使用入口。',
  primaryPath: '/data-products',
  icon: Database,
  routePrefixes: ['/data-products'],
  navTargets: ['/data-products'],
  homeSectionKeys: ['data-products'],
}
