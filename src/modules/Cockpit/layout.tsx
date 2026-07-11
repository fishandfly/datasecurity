import { Outlet } from 'react-router-dom'

export function CockpitLayout() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050914] text-[#d8f3ff]">
      <Outlet />
    </main>
  )
}
