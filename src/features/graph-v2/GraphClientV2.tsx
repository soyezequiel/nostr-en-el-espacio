'use client'

import dynamic from 'next/dynamic'
import './ui/graph-v2.css'

const GraphAppV2 = dynamic(() => import('@/features/graph-v2/ui/GraphAppV2'), {
  ssr: false,
  loading: () => (
    <main className="bg-[#0b0d0f]" style={{ height: '100dvh' }}>
      <div className="mx-auto h-full max-w-[1600px] p-4">
        <div className="h-full rounded-3xl border border-white/10 bg-black/20" />
      </div>
    </main>
  ),
})

export default function GraphClientV2() {
  return <GraphAppV2 />
}

