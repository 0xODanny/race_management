import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Label } from '../../ui/Label'
import { useI18n } from '../../i18n/i18n'

type Sex = 'F' | 'M'

type AgeBracket = 'U19' | '20-29' | '30-39' | '40-49' | '50-59' | '60-69' | '70+'

function toDigitsOnly(raw: string): string {
  return raw.replace(/\D+/g, '')
}

function hasAtLeastTwoWords(name: string): boolean {
  return name.trim().split(/\s+/).filter(Boolean).length >= 2
}

function isValidPhoneDigits(countryCode: '+55' | '+1', digits: string): boolean {
  const d = toDigitsOnly(digits)
  if (countryCode === '+55') return /^\d{10,11}$/.test(d)
  if (countryCode === '+1') return /^\d{10}$/.test(d)
  return false
}

export function RegisterPage() {
  const { eventId } = useParams()
  const auth = useAuth()
  const { tr, lang } = useI18n()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [sex, setSex] = useState<Sex>('M')
  const [ageBracket, setAgeBracket] = useState<AgeBracket | ''>('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyCountryCode, setEmergencyCountryCode] = useState<'+55' | '+1'>(() => (lang === 'pt-BR' ? '+55' : '+1'))
  const [emergencyPhoneDigits, setEmergencyPhoneDigits] = useState('')
  const [waiverAccepted, setWaiverAccepted] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const ageOptions: Array<{ value: AgeBracket; label: string }> = useMemo(
    () => [
      { value: 'U19', label: tr({ en: 'Under 19', pt: 'Abaixo de 19' }) },
      { value: '20-29', label: tr({ en: '20–29', pt: '20–29' }) },
      { value: '30-39', label: tr({ en: '30–39', pt: '30–39' }) },
      { value: '40-49', label: tr({ en: '40–49', pt: '40–49' }) },
      { value: '50-59', label: tr({ en: '50–59', pt: '50–59' }) },
      { value: '60-69', label: tr({ en: '60–69', pt: '60–69' }) },
      { value: '70+', label: tr({ en: '70+', pt: '70+' }) },
    ],
    [tr],
  )

  const emergencyNameOk = useMemo(() => hasAtLeastTwoWords(emergencyName), [emergencyName])
  const emergencyPhoneOk = useMemo(
    () => isValidPhoneDigits(emergencyCountryCode, emergencyPhoneDigits),
    [emergencyCountryCode, emergencyPhoneDigits],
  )

  const canSubmit = useMemo(() => {
    if (!eventId) return false
    if (!auth.user) return false
    return (
      fullName.trim().length >= 2 &&
      phone.trim().length >= 6 &&
      birthdate.length === 10 &&
      ageBracket !== '' &&
      emergencyNameOk &&
      emergencyPhoneOk &&
      waiverAccepted
    )
  }, [ageBracket, auth.user, birthdate, emergencyNameOk, emergencyPhoneOk, eventId, fullName, phone, waiverAccepted])

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
          categoryId: ageBracket ? `${sex}-${ageBracket}` : null,
          emergencyContact: { name: emergencyName.trim(), phone: `${emergencyCountryCode}${toDigitsOnly(emergencyPhoneDigits)}` },
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
            </select>
          </div>
          <div>
            <Label>{tr({ en: 'Age category', pt: 'Categoria por idade' })}</Label>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              value={ageBracket}
              onChange={(e) => setAgeBracket(e.target.value as any)}
            >
              <option value="">{tr({ en: 'Select…', pt: 'Selecione…' })}</option>
              {ageOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-bold">{tr({ en: 'Emergency contact', pt: 'Contato de emergência' })}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <Label>{tr({ en: 'Name', pt: 'Nome' })}</Label>
              <Input
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder={tr({ en: 'First Last', pt: 'Nome Sobrenome' })}
              />
              {!emergencyNameOk && emergencyName.trim().length ? (
                <div className="mt-1 text-xs text-zinc-600">
                  {tr({
                    en: 'Enter at least first and last name.',
                    pt: 'Informe pelo menos nome e sobrenome.',
                  })}
                </div>
              ) : null}
            </div>
            <div>
              <Label>{tr({ en: 'Phone', pt: 'Telefone' })}</Label>
              <div className="flex gap-2">
                <select
                  className="w-[7.5rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  value={emergencyCountryCode}
                  onChange={(e) => setEmergencyCountryCode(e.target.value as any)}
                >
                  <option value="+55">🇧🇷 +55</option>
                  <option value="+1">🇺🇸 +1</option>
                </select>
                <Input
                  value={emergencyPhoneDigits}
                  onChange={(e) => setEmergencyPhoneDigits(toDigitsOnly(e.target.value))}
                  inputMode="numeric"
                  placeholder={emergencyCountryCode === '+55' ? '12991938407' : '4155551234'}
                />
              </div>
              {!emergencyPhoneOk && emergencyPhoneDigits.trim().length ? (
                <div className="mt-1 text-xs text-zinc-600">
                  {emergencyCountryCode === '+55'
                    ? tr({
                        en: 'Use 10–11 digits (e.g., 12991938407).',
                        pt: 'Use 10–11 dígitos (ex.: 12991938407).',
                      })
                    : tr({
                        en: 'Use 10 digits (e.g., 4155551234).',
                        pt: 'Use 10 dígitos (ex.: 4155551234).',
                      })}
                </div>
              ) : null}
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
