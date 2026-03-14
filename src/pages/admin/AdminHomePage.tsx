import { Link } from 'react-router-dom'

export function AdminHomePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-2 text-sm text-zinc-700">
          MVP admin dashboard skeleton (events, categories, checkpoints, routes, assignments, live sessions, scan audit).
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">Tools</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>Create events, categories, checkpoints, and block-based route stages</li>
          <li>Assign route variants to athletes (qualifiers/finals)</li>
          <li>Monitor live race sessions and scan logs</li>
          <li>Validate/disqualify results and inspect suspicious sequences</li>
        </ul>
        <div className="mt-4 text-sm text-zinc-700">
          Next step: wire CRUD pages against Supabase tables (schema provided under supabase/migrations).
        </div>
        <div className="mt-4">
          <Link to="/" className="underline">
            Back to public site
          </Link>
        </div>
      </section>
    </div>
  )
}
