import { Link } from 'react-router-dom'
import { useRaceStore } from '../../state/raceStore'

export function CourseInfoPage() {
  const pkg = useRaceStore((s) => s.activePackage)
  if (!pkg) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Course info</h1>
        <div className="text-sm text-zinc-700">No race package loaded.</div>
        <Link to="/athlete" className="underline">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Course info</h1>
        <div className="mt-2 text-sm text-zinc-700">
          Route <span className="font-semibold">{pkg.route.routeCode}</span> • Strict order enforced
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">Stages</h2>
        <ol className="mt-3 space-y-3">
          {pkg.route.stages.map((s) => (
            <li key={s.stageNo} className="rounded-md border border-zinc-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">
                  Stage {s.stageNo} • {s.stageType === 'anchor' ? 'Anchor' : `Block ${s.stageCode}`}
                </div>
                <div className="text-xs text-zinc-600">{s.checkpoints.length} checkpoints</div>
              </div>
              <div className="mt-2 text-sm text-zinc-800">
                {s.checkpoints.map((cp, idx) => (
                  <div key={cp.checkpointId} className="flex items-center justify-between">
                    <div>
                      {idx + 1}. {cp.code} {cp.name ? `— ${cp.name}` : ''}
                    </div>
                    <div className="text-xs text-zinc-600">{cp.kind}</div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
