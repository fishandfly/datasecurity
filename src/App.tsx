import { Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ServiceLayout } from './layouts/service-layout'
import { DataCatalogRoutes, EmbedAwareNavigate } from './modules/DataCatalog'

function RouteFallback() {
  return (
    <div className="min-h-[40vh] px-6 py-12 text-center text-[0.875rem] text-slate-500">
      页面加载中...
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<ServiceLayout />}>
          {DataCatalogRoutes()}
          <Route path="*" element={<EmbedAwareNavigate to="/" />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
