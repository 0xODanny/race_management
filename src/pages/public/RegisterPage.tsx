import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Label } from '../../ui/Label'
import { useI18n } from '../../i18n/i18n'

type Sex = 'F' | 'M' | 'X'

export function RegisterPage() {
  const { eventId } = useParams()
  const auth = useAuth()
  const { tr } = useI18n()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [sex, setSex] = useState<Sex>('X')
  const [categoryId, setCategoryId] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [waiverAccepted, setWaiverAccepted] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    if (!eventId) return false
    if (!auth.user) return false
    return (
      fullName.trim().length >= 2 &&
      phone.trim().length >= 6 &&
      birthdate.length === 10 &&
      emergencyName.trim().length >= 2 &&
      emergencyPhone.trim().length >= 6 &&
      waiverAccepted
    )
  }, [auth.user, birthdate, emergencyName, emergencyPhone, eventId, fullName, phone, waiverAccepted])

  async function submit() {
    if (!eventId) return
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (isTrialModeEnabled()) {
        setSuccess(
          tr({
            en: 'Demo registration saved (local). You can now preview staff check-in and race-day pages.',
            pt: 'Inscrição demo salva (local). Agora você pode visualizar o check-in da equipe e as telas do dia da prova.',
          }),
        )
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase)
        throw new Error(
          tr({
            en: 'Supabase is not configured for registration.',
            pt: 'O Supabase não está configurado para inscrições.',
          }),
        )

      const { error } = await supabase.functions.invoke('register-for-event', {
        body: {
          eventId,
          fullName,
          phone,
          birthdate,
          sex,
          categoryId: categoryId || null,
          emergencyContact: { name: emergencyName, phone: emergencyPhone },
          waiverAccepted,
        },
      })
      if (error) throw error
      setSuccess(
        tr({
          en: 'Registration submitted. You can now check in with staff on race day.',
          pt: 'Inscrição enviada. Agora você pode fazer check-in com a equipe no dia da prova.',
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : tr({ en: 'Registration failed', pt: 'Falha na inscrição' }))
    } finally {
      setLoading(false)
    }
  }

  if (!eventId) return <div>{tr({ en: 'Missing event.', pt: 'Evento ausente.' })}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{tr({ en: 'Event registration', pt: 'Inscrição no evento' })}</h1>
        {!auth.user ? (
          <p className="mt-2 text-sm text-zinc-800">
            {tr({ en: 'Please', pt: 'Por favor' })}{' '}
            <Link to="/login" className="underline">
              {tr({ en: 'log in', pt: 'faça login' })}
            </Link>{' '}
            {tr({ en: 'to register.', pt: 'para se inscrever.' })}
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-800">
            {tr({ en: 'Logged in as', pt: 'Logado como' })} {auth.user.email}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>{tr({ en: 'Full name', pt: 'Nome completo' })}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <Label>{tr({ en: 'Phone', pt: 'Telefone' })}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
          <div>
            <Label>{tr({ en: 'Birthdate', pt: 'Data de nascimento' })}</Label>
            <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
          </div>
          <div>
            <Label>{tr({ en: 'Sex', pt: 'Sexo' })}</Label>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
            >
              <option value="F">F</option>
              <option value="M">M</option>
              <option value="X">X</option>
            </select>
          </div>
          <div>
            <Label>{tr({ en: 'Category (optional)', pt: 'Categoria (opcional)' })}</Label>
            <Input
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder={tr({ en: 'Category ID', pt: 'ID da categoria' })}
            />
          </div>
          <div className="md:col-span-2">
            <div className="mt-2 text-xs text-zinc-600">
              {tr({
                en: 'Categories are normally selected from the event list; this MVP uses a simple field.',
                pt: 'Normalmente as categorias são selecionadas na lista do evento; neste MVP usamos um campo simples.',
              })}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-bold">{tr({ en: 'Emergency contact', pt: 'Contato de emergência' })}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <Label>{tr({ en: 'Name', pt: 'Nome' })}</Label>
              <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
            </div>
            <div>
              <Label>{tr({ en: 'Phone', pt: 'Telefone' })}</Label>
              <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={waiverAccepted}
              onChange={(e) => setWaiverAccepted(e.target.checked)}
            />
            <span>
              {tr({
                en: 'I accept the event waiver and acknowledge the risks of outdoor racing.',
                pt: 'Eu aceito o termo de responsabilidade do evento e reconheço os riscos de atividades ao ar livre.',
              })}
              <span className="block text-xs text-zinc-600">
                {tr({ en: '(Full waiver text is configured per event.)', pt: '(O texto completo é configurado por evento.)' })}
              </span>
            </span>
          </label>
        </div>

        {error ? <div className="mt-4 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-4 text-sm text-green-800">{success}</div> : null}

        <div className="mt-5">
          <Button size="lg" onClick={() => void submit()} disabled={!canSubmit || loading}>
            {loading
              ? tr({ en: 'Submitting…', pt: 'Enviando…' })
              : tr({ en: 'Submit registration', pt: 'Enviar inscrição' })}
          </Button>
        </div>
      </section>
    </div>
  )
}
