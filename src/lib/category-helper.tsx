import { 
  Activity, 
  AlertTriangle, 
  BarChart3, 
  CloudRain, 
  Cpu, 
  Droplets, 
  FileSearch, 
  Gavel, 
  Building2,
  LayoutGrid, 
  Leaf, 
  Mountain, 
  Search, 
  Shield, 
  Volume2,
  Trees, 
  Waves, 
  Wind,
  Trash2,
  Zap,
  Box
} from 'lucide-react'

export function getCategoryIcon(category: string) {
  const name = category || ''
  
  if (name.includes('党务') || name.includes('政务')) return <Shield className="h-4 w-4" />
  if (name.includes('综合')) return <LayoutGrid className="h-4 w-4" />
  if (name.includes('督察')) return <Search className="h-4 w-4" />
  if (name.includes('自然') || name.includes('自然生态')) return <Trees className="h-4 w-4" />
  if (name.includes('企业')) return <Building2 className="h-4 w-4" />
  if (name.includes('水') && !name.includes('海洋')) return <Droplets className="h-4 w-4" />
  if (name.includes('海洋')) return <Waves className="h-4 w-4" />
  if (name.includes('大气') || name.includes('气象') || name === '气' || name.includes('空气')) return <Wind className="h-4 w-4" />
  if (name.includes('气候')) return <CloudRain className="h-4 w-4" />
  if (name.includes('土壤')) return <Mountain className="h-4 w-4" />
  if (name.includes('固体') || name.includes('废物') || name.includes('危废') || name.includes('固废')) return <Trash2 className="h-4 w-4" />
  if (name.includes('核') || name.includes('辐射')) return <Zap className="h-4 w-4" />
  if (name.includes('评价') || name.includes('环评')) return <FileSearch className="h-4 w-4" />
  if (name.includes('监测')) return <Activity className="h-4 w-4" />
  if (name.includes('执法')) return <Gavel className="h-4 w-4" />
  if (name.includes('应急')) return <AlertTriangle className="h-4 w-4" />
  if (name.includes('科技') || name.includes('信息化')) return <Cpu className="h-4 w-4" />
  if (name.includes('财务') || name.includes('资金')) return <BarChart3 className="h-4 w-4" />
  if (name.includes('噪') || name.includes('声')) return <Volume2 className="h-4 w-4" />
  if (name.includes('生态')) return <Leaf className="h-4 w-4" />

  return <Box className="h-4 w-4" />
}
