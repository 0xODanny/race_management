import { Link } from 'react-router-dom'
import { useRaceStore } from '../../state/raceStore'
import { useI18n } from '../../i18n/i18n'

export function CourseInfoPage() {
  const { tr } = useI18n()
  const pkg = useRaceStore((s) => s.activePackage)
  if (!pkg) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{tr({ en: 'Course info', pt: 'Informações do percurso' })}</h1>
        <div className="text-sm text-zinc-700">{tr({ en: 'No race package loaded.', pt: 'Nenhum pacote de prova carregado.' })}</div>
        <Link to="/athlete" className="underline">
          {tr({ en: 'Back', pt: 'Voltar' })}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{tr({ en: 'Course info', pt: 'Informações do percurso' })}</h1>
        <div className="mt-2 text-sm text-zinc-700">
          {tr({ en: 'Route', pt: 'Rota' })} <span className="font-semibold">{pkg.route.routeCode}</span> •{' '}
          {tr({ en: 'Strict order enforced', pt: 'Ordem estrita aplicada' })}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Stages', pt: 'Etapas' })}</h2>
        <ol className="mt-3 space-y-3">
          {pkg.route.stages.map((s) => (
            <li key={s.stageNo} className="rounded-md border border-zinc-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">
                  {tr({ en: 'Stage', pt: 'Etapa' })} {s.stageNo} •{' '}
                  {s.stageType === 'anchor'
                    ? tr({ en: 'Anchor', pt: 'Anchor' })
                    : tr({ en: `Block ${s.stageCode}`, pt: `Block ${s.stageCode}` })}
                </div>
                <div className="text-xs text-zinc-600">
                  {s.checkpoints.length} {tr({ en: 'checkpoints', pt: 'Checkpoints' })}
                </div>
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
