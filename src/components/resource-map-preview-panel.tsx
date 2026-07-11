import { ExternalLink, Layers3, MapPinned } from 'lucide-react'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogMapPreview } from '../lib/nocobase-portal-data'
import { getSpatialLayerKindLabel } from '../lib/catalog-spatial-resource'

declare global {
  interface Window {
    require?: (
      modules: string[],
      onLoad: (...loadedModules: unknown[]) => void,
      onError?: (error: Error) => void,
    ) => void
  }
}

type ResourceMapPreviewPanelProps = {
  preview: CatalogMapPreview
  resourceName: string
}

type GeoSceneLayerCtor = new (options: Record<string, unknown>) => unknown
type GeoSceneView = {
  when: () => Promise<void>
  ui: {
    add: (widget: unknown, position: string) => void
    remove: (name: string) => void
  }
  goTo?: (target: unknown) => Promise<void>
  destroy?: () => void
}

const GEOSCENE_INIT_URL = 'https://js.geoscene.cn/4.29/init.js'
const GEOSCENE_THEME_URL = 'https://js.geoscene.cn/4.29/geoscene/themes/light/main.css'
const AMAP_JS_API_KEY = 'ade0dd87c4733b88c995aebe25e5ba0c'

let geosceneSdkPromise: Promise<void> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function ensureGeoSceneTheme() {
  if (typeof document === 'undefined') return
  const existing = document.querySelector<HTMLLinkElement>(`link[data-geoscene-theme="true"]`)
  if (existing) return

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = GEOSCENE_THEME_URL
  link.dataset.geosceneTheme = 'true'
  document.head.appendChild(link)
}

function ensureGeoSceneSdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('当前环境不支持地图预览'))
  }

  ensureGeoSceneTheme()

  if (typeof window.require === 'function') {
    return Promise.resolve()
  }

  if (!geosceneSdkPromise) {
    geosceneSdkPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[data-geoscene-sdk="true"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('GeoScene SDK 脚本加载失败')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = GEOSCENE_INIT_URL
      script.async = true
      script.dataset.geosceneSdk = 'true'
      script.onload = () => {
        if (typeof window.require === 'function') {
          resolve()
          return
        }
        reject(new Error('GeoScene SDK 已加载，但 require 未初始化'))
      }
      script.onerror = () => reject(new Error('GeoScene SDK 脚本加载失败'))
      document.head.appendChild(script)
    }).catch((error) => {
      geosceneSdkPromise = null
      throw error
    })
  }

  return geosceneSdkPromise
}

function loadGeoSceneModules(moduleIds: string[]) {
  return new Promise<unknown[]>((resolve, reject) => {
    if (typeof window.require !== 'function') {
      reject(new Error('GeoScene SDK 未就绪'))
      return
    }
    window.require(moduleIds, (...loadedModules: unknown[]) => resolve(loadedModules), reject)
  })
}

function buildLayer(preview: CatalogMapPreview, constructors: {
  TileLayer: GeoSceneLayerCtor
  MapImageLayer: GeoSceneLayerCtor
  FeatureLayer: GeoSceneLayerCtor
  SceneLayer: GeoSceneLayerCtor
}) {
  const layerOptions = { url: preview.serviceUrl }
  switch (preview.layerKind) {
    case 'tile':
      return new constructors.TileLayer(layerOptions)
    case 'map-image':
      return new constructors.MapImageLayer(layerOptions)
    case 'feature':
      return new constructors.FeatureLayer(layerOptions)
    case 'scene':
      return new constructors.SceneLayer(layerOptions)
    default:
      throw new Error(`暂不支持的地图图层类型: ${preview.layerKind}`)
  }
}

function formatAuthMode(authMode: string) {
  const normalized = authMode.trim().toLowerCase()
  if (!normalized || normalized === 'anonymous') return '匿名访问'
  return authMode
}

function isAmapPreview(preview: CatalogMapPreview) {
  return preview.serviceType.trim().toLowerCase() === 'amap'
}

function readNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function resolveAmapCenter(initialExtent: CatalogMapPreview['initialExtent']) {
  if (!initialExtent) return [125.32599, 43.89654]

  const centerX = readNumber(initialExtent.centerX ?? initialExtent.center_x ?? initialExtent.longitude ?? initialExtent.lng)
  const centerY = readNumber(initialExtent.centerY ?? initialExtent.center_y ?? initialExtent.latitude ?? initialExtent.lat)
  if (centerX != null && centerY != null) return [centerX, centerY]

  const xmin = readNumber(initialExtent.xmin ?? initialExtent.minX ?? initialExtent.min_x)
  const xmax = readNumber(initialExtent.xmax ?? initialExtent.maxX ?? initialExtent.max_x)
  const ymin = readNumber(initialExtent.ymin ?? initialExtent.minY ?? initialExtent.min_y)
  const ymax = readNumber(initialExtent.ymax ?? initialExtent.maxY ?? initialExtent.max_y)
  if (xmin != null && xmax != null && ymin != null && ymax != null) {
    return [(xmin + xmax) / 2, (ymin + ymax) / 2]
  }

  return [125.32599, 43.89654]
}

function resolveAmapZoom(initialExtent: CatalogMapPreview['initialExtent']) {
  if (!initialExtent) return 8
  const zoom = readNumber(initialExtent.zoom)
  if (zoom != null) return Math.max(3, Math.min(20, Math.round(zoom)))
  return 8
}

function buildAmapIframeHtml(preview: CatalogMapPreview) {
  const center = resolveAmapCenter(preview.initialExtent)
  const zoom = resolveAmapZoom(preview.initialExtent)
  const serviceUrl = preview.serviceUrl.trim()

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #eef5fb; }
    #map { width: 100%; height: 100%; }
    .err {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      color: #9d4e4e;
      background: rgba(255, 249, 249, 0.92);
      font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    window._AMapSecurityConfig = { securityJsCode: "" };
    const center = ${JSON.stringify(center)};
    const zoom = ${JSON.stringify(zoom)};
    const serviceUrl = ${JSON.stringify(serviceUrl)};

    function showError(e) {
      const message = e && e.message ? e.message : String(e);
      const errorElement = document.createElement('div');
      errorElement.className = 'err';
      errorElement.textContent = '高德地图预览加载失败：' + message;
      document.body.appendChild(errorElement);
    }

    function initAmapPreview() {
      try {
        const map = new AMap.Map('map', {
          viewMode: '2D',
          resizeEnable: true,
          zoom: zoom,
          center: center,
        });
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: 'RB' }));
        if (/\\.(png|jpe?g|webp|gif)(\\?|#|$)/i.test(serviceUrl)) {
          new AMap.ImageLayer({ url: serviceUrl, bounds: map.getBounds(), zooms: [3, 20] }).setMap(map);
        }
      } catch (e) {
        showError(e);
      }
    }

    const sdk = document.createElement('script');
    sdk.src = 'https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_API_KEY}&plugin=AMap.Scale,AMap.ToolBar';
    sdk.async = true;
    sdk.onload = initAmapPreview;
    sdk.onerror = function () { showError(new Error('高德 JS API 脚本加载失败')); };
    document.head.appendChild(sdk);
  </script>
</body>
</html>`
}

export function ResourceMapPreviewPanel({ preview, resourceName }: ResourceMapPreviewPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const isAmap = isAmapPreview(preview)
  const amapIframeHtml = useMemo(() => isAmap ? buildAmapIframeHtml(preview) : '', [isAmap, preview])

  useEffect(() => {
    if (isAmap) {
      setIsLoading(false)
      setErrorMessage('')
      return
    }

    let cancelled = false
    let view: GeoSceneView | null = null

    const mountPreview = async () => {
      if (!mapContainerRef.current) return
      startTransition(() => {
        setIsLoading(true)
        setErrorMessage('')
      })

      try {
        await ensureGeoSceneSdk()
        const [
          GeoSceneMapCtor,
          MapViewCtor,
          HomeCtor,
          ScaleBarCtor,
          TileLayerCtor,
          MapImageLayerCtor,
          FeatureLayerCtor,
          SceneLayerCtor,
        ] = await loadGeoSceneModules([
          'geoscene/Map',
          'geoscene/views/MapView',
          'geoscene/widgets/Home',
          'geoscene/widgets/ScaleBar',
          'geoscene/layers/TileLayer',
          'geoscene/layers/MapImageLayer',
          'geoscene/layers/FeatureLayer',
          'geoscene/layers/SceneLayer',
        ])

        if (cancelled || !mapContainerRef.current) return

        const layer = buildLayer(preview, {
          TileLayer: TileLayerCtor as GeoSceneLayerCtor,
          MapImageLayer: MapImageLayerCtor as GeoSceneLayerCtor,
          FeatureLayer: FeatureLayerCtor as GeoSceneLayerCtor,
          SceneLayer: SceneLayerCtor as GeoSceneLayerCtor,
        })

        const map = new (GeoSceneMapCtor as GeoSceneLayerCtor)({ layers: [layer] })
        view = new (MapViewCtor as GeoSceneLayerCtor)({
          container: mapContainerRef.current,
          map,
          constraints: { snapToZoom: false },
        }) as GeoSceneView

        const home = new (HomeCtor as GeoSceneLayerCtor)({ view })
        const scaleBar = new (ScaleBarCtor as GeoSceneLayerCtor)({ view, unit: 'metric' })

        view.ui.add(home, 'top-left')
        view.ui.add(scaleBar, 'bottom-right')
        view.ui.remove('attribution')

        await view.when()

        if (!cancelled && preview.initialExtent && view.goTo) {
          await view.goTo(preview.initialExtent)
        }

        if (!cancelled) {
          startTransition(() => {
            setIsLoading(false)
          })
        }
      } catch (error) {
        if (cancelled) return
        startTransition(() => {
          setIsLoading(false)
          setErrorMessage(error instanceof Error ? error.message : '地图预览初始化失败')
        })
      }
    }

    void mountPreview()

    return () => {
      cancelled = true
      if (view?.destroy) {
        view.destroy()
      }
    }
  }, [isAmap, preview])

  return (
    <div className="mt-[1px] rounded-[10px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,#f9fcff,#f4f9fc)] p-5 text-[0.875rem] text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[#304255]">
            <MapPinned className="h-5 w-5 text-[var(--primary)]" />
            <span>地图预览</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[0.75rem] text-[var(--text-muted)]">
            <span className="rounded-full border border-[#d8e7f4] bg-white px-3 py-1">类型：{preview.serviceType}</span>
            <span className="rounded-full border border-[#d8e7f4] bg-white px-3 py-1">
              图层模式：{getSpatialLayerKindLabel(preview.layerKind)}
            </span>
            <span className="rounded-full border border-[#d8e7f4] bg-white px-3 py-1">鉴权：{formatAuthMode(preview.authMode)}</span>
            <span className="rounded-full border border-[#d8e7f4] bg-white px-3 py-1">
              缓存：{preview.isCached ? '是' : '否'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={preview.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(210,225,238,0.96)] bg-white px-4 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <ExternalLink className="h-4 w-4" />
            打开原生预览
          </a>
          <a
            href={preview.serviceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(210,225,238,0.96)] bg-white px-4 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Layers3 className="h-4 w-4" />
            查看服务地址
          </a>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[16px] border border-[rgba(214,228,239,0.92)] bg-[linear-gradient(180deg,#ffffff,#f5f9ff)] shadow-[0_18px_34px_rgba(39,80,120,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(214,228,239,0.92)] bg-[linear-gradient(180deg,#fcfeff,#f4f9ff)] px-4 py-3 text-[0.75rem] text-[var(--text-muted)]">
          <span className="font-medium text-[#35506a]">{resourceName}</span>
          <span className="truncate">服务地址：{preview.serviceUrl}</span>
        </div>

        <div className="relative h-[520px] min-h-[360px] w-full bg-[#eef5fb]">
          {isAmap ? (
            <iframe
              title={`${resourceName} 高德地图预览`}
              srcDoc={amapIframeHtml}
              className="block h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div ref={mapContainerRef} className="h-full w-full" />
          )}

          {!isAmap && isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[rgba(246,250,255,0.78)] backdrop-blur-[1px]">
              <div className="rounded-full border border-[#d8e7f4] bg-white px-4 py-2 text-[0.8125rem] text-[#35506a] shadow-[0_12px_24px_rgba(39,80,120,0.08)]">
                正在加载 GeoScene 地图预览...
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[rgba(255,249,249,0.86)] px-6">
              <div className="max-w-[520px] rounded-[16px] border border-[rgba(235,209,209,0.92)] bg-[linear-gradient(180deg,#fffafa,#fff4f4)] px-5 py-5 text-center shadow-[0_16px_30px_rgba(39,80,120,0.10)]">
                <div className="text-[0.9375rem] font-semibold text-[#9d4e4e]">地图预览加载失败</div>
                <div className="mt-2 text-[0.8125rem] leading-6 text-[#9d4e4e]">{errorMessage}</div>
                <div className="mt-4 text-[0.75rem] text-[#7d5a5a]">可先使用上方“打开原生预览”继续查看 GeoScene 服务。</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {preview.initialExtent && isRecord(preview.initialExtent) ? (
        <div className="mt-4 rounded-[12px] border border-[rgba(214,228,239,0.92)] bg-white px-4 py-3 text-[0.75rem] text-[var(--text-muted)] shadow-[0_10px_22px_rgba(39,80,120,0.05)]">
          初始范围：xmin {String(preview.initialExtent.xmin ?? '-')}, ymin {String(preview.initialExtent.ymin ?? '-')}, xmax{' '}
          {String(preview.initialExtent.xmax ?? '-')}, ymax {String(preview.initialExtent.ymax ?? '-')}
        </div>
      ) : null}
    </div>
  )
}
