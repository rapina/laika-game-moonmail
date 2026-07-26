import { describe, it, expect } from 'vitest'
import { translations } from './translations'

/**
 * Locale-parity guard: every locale must expose exactly the same key set with
 * non-empty values. Catches the classic "added a key to ko only" mistake.
 * When adding per-domain translation files, mirror this test for each file.
 */
const locales = Object.keys(translations) as (keyof typeof translations)[]
const baseline = 'en' as const

describe('translations', () => {
    it('covers ko / en', () => {
        expect(new Set(locales)).toEqual(new Set(['ko', 'en']))
    })

    it.each(locales)('locale "%s" has the same keys as the baseline', (locale) => {
        const baseKeys = Object.keys(translations[baseline]).sort()
        const keys = Object.keys(translations[locale]).sort()
        expect(keys).toEqual(baseKeys)
    })

    it.each(locales)('locale "%s" has no empty values', (locale) => {
        for (const [key, value] of Object.entries(translations[locale])) {
            expect(value.trim(), `${locale}.${key}`).not.toBe('')
        }
    })
})
