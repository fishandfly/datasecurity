import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const homePageSource = readFileSync(resolve(process.cwd(), 'src/pages/home-page.tsx'), 'utf8')
const primaryOverviewCardsSource = readFileSync(resolve(process.cwd(), 'src/components/primary-overview-cards.tsx'), 'utf8')
const statDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-stat-data.ts'), 'utf8')

test('首页概览卡仍走 current overview 聚合，推荐和更新概览改为读取 latestResourceStatMap', () => {
  const currentOverviewStatsBlock = statDataSource.match(
    /async function fetchCurrentOverviewStats\(\): Promise<CurrentOverviewStats> \{[\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.equal(primaryOverviewCardsSource.includes('useLatestResourceStatMap('), false)
  assert.equal(primaryOverviewCardsSource.includes('useCurrentOverviewStats('), true)
  assert.match(homePageSource, /import \{ useLatestResourceStatMap \} from '\.\.\/lib\/nocobase-stat-data'/)
  assert.match(homePageSource, /const \{ data: latestResourceStatMap \} = useLatestResourceStatMap\(statEnabled\)/)
  assert.match(homePageSource, /const \[activeOverviewTab, setActiveOverviewTab\] = useState<OverviewTabKey>\('data'\)/)
  assert.match(homePageSource, /const dataUpdateColumns = useMemo\(\(\) => \{/)
  assert.match(homePageSource, /const sourceUpdateColumns = useMemo\(\(\) => \{/)
  assert.match(homePageSource, /const businessUpdateColumns = useMemo\(\(\) => \{/)
  assert.match(homePageSource, /const overviewTabViews = useMemo<UpdateOverviewTabView\[\]>\(\(\) => \(\[/)
  assert.match(homePageSource, /const DATA_UPDATE_COLUMNS = 4/)
  assert.match(homePageSource, /buildLatestUpdatedItems\(matchedItems, SOURCE_UPDATE_ROWS_PER_COLUMN, latestResourceStatMap\)/)
  assert.match(homePageSource, /slice\(0, DATA_UPDATE_COLUMNS\)/)
  assert.match(homePageSource, /slice\(0, BUSINESS_UPDATE_COLUMNS\)/)
  assert.match(homePageSource, /limitRecommendedItems\(catalogItems, 30, latestResourceStatMap\)/)
  assert.equal(currentOverviewStatsBlock.includes('fetchLatestResourceStatMap()'), false)
})

test('首页推荐卡与更新概览使用 current dw30 统计中的业务时间，并按来源分为三列', () => {
  const dataOverviewIndex = homePageSource.indexOf('按数据分类的业务数据更新时间概览')
  const sourceOverviewIndex = homePageSource.indexOf('按来源分类的业务数据更新时间概览')

  assert.match(homePageSource, /const recommendedItems = useMemo\(\n\s+\(\) => limitRecommendedItems\(catalogItems, 30, latestResourceStatMap\),/)
  assert.match(homePageSource, /tabLabel: '按数据分类'/)
  assert.match(homePageSource, /tabLabel: '按来源分类'/)
  assert.match(homePageSource, /tabLabel: '按业务分类'/)
  assert.match(homePageSource, /label: '部级'/)
  assert.match(homePageSource, /label: '省级内部'/)
  assert.match(homePageSource, /label: '省级外部'/)
  assert.match(homePageSource, /按数据分类的业务数据更新时间概览/)
  assert.match(homePageSource, /按来源分类的业务数据更新时间概览/)
  assert.match(homePageSource, /按业务分类的业务数据更新时间概览/)
  assert.ok(dataOverviewIndex > -1 && sourceOverviewIndex > -1 && dataOverviewIndex < sourceOverviewIndex)
  assert.match(homePageSource, /onClick=\{\(\) => setActiveOverviewTab\(item\.key\)\}/)
  assert.match(homePageSource, /<UpdateOverviewPanel\s+columns=\{activeOverviewView\.columns\}/)
  assert.match(homePageSource, /resolveLatestBusinessUpdateTimeText\(item\.id, latestResourceStatMap\)/)
  assert.match(homePageSource, /CatalogOverviewPanel/)
  assert.match(homePageSource, /to=\{withEmbed\(`\/catalog\/\$\{item\.id\}`\)\}/)
  assert.doesNotMatch(homePageSource, /生态主题资源分布/)
  assert.doesNotMatch(homePageSource, /dw30 口径/)
})
