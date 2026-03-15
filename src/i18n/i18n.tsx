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

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-semibold"
      onClick={() => setLang(isPt ? 'en' : 'pt-BR')}
      aria-label={isPt ? 'Switch language to English' : 'Trocar idioma para Português (Brasil)'}
      title={isPt ? 'English' : 'Português (Brasil)'}
    >
      <span aria-hidden className="text-base leading-none">
        {isPt ? '🇧🇷' : '🇺🇸'}
      </span>
      <span className="text-xs">{isPt ? 'POR' : 'ENG'}</span>
    </button>
  )
}
