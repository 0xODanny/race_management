import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/i18n'

export function AdminHomePage() {
  const { tr } = useI18n()
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {tr({
            en: 'MVP admin dashboard skeleton (events, categories, checkpoints, routes, assignments, live sessions, scan audit).',
            pt: 'Esqueleto do painel de admin (eventos, categorias, Checkpoints, rotas, atribuições, sessões ao vivo, auditoria de scans).',
          })}
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Tools', pt: 'Ferramentas' })}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>
            {tr({
              en: 'Create events, categories, checkpoints, and block-based route stages',
              pt: 'Criar eventos, categorias, Checkpoints e etapas de rota baseadas em blocks',
            })}
          </li>
          <li>
            {tr({
              en: 'Assign route variants to athletes (qualifiers/finals)',
              pt: 'Atribuir variantes de rota aos atletas (qualificatórias/finais)',
            })}
          </li>
          <li>{tr({ en: 'Monitor live race sessions and scan logs', pt: 'Monitorar sessões ao vivo e logs de scans' })}</li>
          <li>
            {tr({
              en: 'Validate/disqualify results and inspect suspicious sequences',
              pt: 'Validar/desclassificar resultados e inspecionar sequências suspeitas',
            })}
          </li>
        </ul>
        <div className="mt-4 text-sm text-zinc-700">
          {tr({
            en: 'Next step: wire CRUD pages against Supabase tables (schema provided under supabase/migrations).',
            pt: 'Próximo passo: ligar páginas CRUD às tabelas do Supabase (schema em supabase/migrations).',
          })}
        </div>
        <div className="mt-4">
          <Link to="/" className="underline">
            {tr({ en: 'Back to public site', pt: 'Voltar ao site público' })}
          </Link>
        </div>
      </section>
    </div>
  )
}
