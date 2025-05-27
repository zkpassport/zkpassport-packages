import { Suspense } from "react"

export default function CircuitsPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Circuit Registry Explorer</h1>
      <Suspense fallback={<div>Loading...</div>}></Suspense>
    </div>
  )
}
