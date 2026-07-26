import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translations, type Locale } from './translations'
import { STORAGE_PREFIX } from '../appConfig'

const STORAGE_KEY = `${STORAGE_PREFIX}-locale`
const SUPPORTED: Locale[] = ['ko', 'en']

function detectLocale(): Locale {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored && SUPPORTED.includes(stored as Locale)) return stored as Locale
    } catch { /* Arcade sandbox intentionally denies storage access. */ }

    const nav = navigator.language?.toLowerCase() ?? ''
    if (nav.startsWith('ko')) return 'ko'
    return 'en'
}

// Merge per-domain translation files here as the game grows
// (e.g. { ...translations[locale], ...gameUiTranslations[locale] }).
const resources: Record<string, { translation: Record<string, string> }> = {}
for (const locale of SUPPORTED) {
    resources[locale] = {
        translation: {
            ...translations[locale],
        },
    }
}

i18n.use(initReactI18next).init({
    resources,
    lng: detectLocale(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
})

/** Change locale and persist */
export function setLocale(locale: Locale): void {
    i18n.changeLanguage(locale)
    try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* Host owns Arcade locale persistence. */ }
}

export function getLocale(): Locale {
    return i18n.language as Locale
}

export { SUPPORTED, type Locale }
export default i18n
