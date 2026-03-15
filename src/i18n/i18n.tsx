import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'en' | 'pt-BR'

const LANG_KEY = 'rm_lang_v1'

function getDefaultLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(LANG_KEY)
    if (stored === 'en' || stored === 'pt-BR') return stored
  } catch {
    // ignore
  }

  const navLang = typeof navigator !== 'undefined' ? navigator.language : ''
  if (navLang.toLowerCase().startsWith('pt')) return 'pt-BR'
  return 'en'
}

type TrInput = { en: string; pt: string }

export type I18nApi = {
  lang: Language
  setLang: (lang: Language) => void
  tr: (v: TrInput) => string
}

const I18nContext = createContext<I18nApi | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en'
    return getDefaultLanguage()
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(LANG_KEY, lang)
    } catch {
      // ignore
    }
  }, [lang])

  const api = useMemo<I18nApi>(() => {
    return {
      lang,
      setLang,
      tr: (v) => (lang === 'pt-BR' ? v.pt : v.en),
    }
  }, [lang])

  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nApi {
  const v = useContext(I18nContext)
  if (!v) throw new Error('useI18n must be used within I18nProvider')
  return v
}

export function LanguageToggle() {
  const { lang, setLang } = useI18n()
  const isPt = lang === 'pt-BR'
  const common = 'h-8 w-10 rounded-md text-base leading-none'
  const active = 'bg-black text-white'
  const inactive = 'bg-white text-zinc-900 hover:bg-zinc-50'

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white p-1">
      <button
        type="button"
        className={common + ' ' + (isPt ? active : inactive)}
        onClick={() => setLang('pt-BR')}
        aria-label="Português (Brasil)"
        title="Português (Brasil)"
      >
        🇧🇷
      </button>
      <button
        type="button"
        className={common + ' ' + (!isPt ? active : inactive)}
        onClick={() => setLang('en')}
        aria-label="English"
        title="English"
      >
        🇺🇸
      </button>
    </div>
  )
}
