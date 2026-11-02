import { describe, expect, it } from 'vitest'
import defaults from './__fixtures__/defaults.json'
import {
  SECTION_KEYS, checkSection, deepEqual, diff, effective, fillSample, getAt, impactSentences,
  pathFromProblem, setAt, xLength, type Json, type JsonObject,
} from './core'
import { SECTIONS, allFields } from './fields'

const D = defaults as unknown as Record<string, JsonObject>
const ctx = { referral_reward: 5, follow_reward: 2, invite_link_base: 'https://nextquark.in/invite/' }

describe('paths', () => {
  it('gets and sets nested values immutably', () => {
    const a = { header: { show_location: false } } as JsonObject
    const b = setAt(a, ['header', 'show_location'], true)
    expect(getAt(b, ['header', 'show_location'])).toBe(true)
    expect(getAt(a, ['header', 'show_location'])).toBe(false)
  })
  it('falls back to the default for missing fields', () => {
    expect(effective({}, D.limits, ['free_swipes_per_cycle'])).toBe(10)
  })
  it('deepEqual ignores key order', () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
  })
})

describe('field definitions', () => {
  it('cover every section and every default field (no invented, none missing)', () => {
    expect(SECTIONS.map(s => s.key).sort()).toEqual([...SECTION_KEYS].sort())
    for (const s of SECTIONS) {
      const def = D[s.key]
      const paths = allFields(s).map(f => f.path.join('.'))
      for (const p of paths) expect(getAt(def, p.split('.')), `${s.key}.${p}`).not.toBeUndefined()
      // Every leaf of the default is reachable through some field.
      const leafPaths = (v: Json, p: string[] = []): string[] =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.entries(v).flatMap(([k, x]) => leafPaths(x, [...p, k]))
          : [p.join('.')]
      const leaves = leafPaths(def)
      for (const leaf of leaves) {
        expect(paths.some(p => leaf === p || leaf.startsWith(p + '.')), `${s.key}.${leaf} has no control`).toBe(true)
      }
    }
  })
  it('defaults pass every website check with no errors', () => {
    for (const k of SECTION_KEYS) {
      const errs = checkSection(k, D[k], D[k], D[k]).filter(i => i.severity === 'error')
      expect(errs, k).toEqual([])
    }
  })
  it('defaults raise no warnings either', () => {
    for (const k of SECTION_KEYS) expect(checkSection(k, D[k], D[k], D[k]), k).toEqual([])
  })
})

describe('diff', () => {
  it('lists changed leaves only', () => {
    const after = setAt(D.job_card, ['header', 'show_location'], true)
    expect(diff(D.job_card, after)).toEqual([{ path: ['header', 'show_location'], before: false, after: true }])
  })
  it('treats a null old value (first history row) as empty', () => {
    expect(diff(null, { a: 1 })).toEqual([{ path: ['a'], before: undefined, after: 1 }])
  })
})

describe('placeholders', () => {
  it('fills share messages with sample values', () => {
    expect(fillSample('Use {code}: {link}', ctx, 'copy.share', ['x'])).toBe('Use ADIT4K2Q: https://nextquark.in/invite/ADIT4K2Q')
  })
  it('leaves placeholders that are not filled in that field', () => {
    expect(fillSample('{code} {countdown}', ctx, 'copy.free_swipes', ['title'])).toBe('{code} {countdown}')
    expect(fillSample('in {countdown}', ctx, 'copy.out_of_swipes', ['reset_countdown'])).toBe('in 3d 4h')
  })
  it('warns about unknown and out-of-place placeholders', () => {
    const v = { ...D['copy.free_swipes'], subtitle: 'Get {refferal_reward}', title: 'Hi {code}' }
    const msgs = checkSection('copy.free_swipes', v, D['copy.free_swipes']).map(i => `${i.path.join('.')}:${i.severity}`)
    expect(msgs).toContain('subtitle:warning')
    expect(msgs).toContain('title:warning')
  })
  it('warns when a share message drops {code} or {link}', () => {
    const v = { ...D['copy.share'], x: 'Iris is great' }
    const issues = checkSection('copy.share', v, D['copy.share']).filter(i => i.path[0] === 'x')
    expect(issues.map(i => i.message).join(' ')).toMatch(/\{code\}.*\{link\}/)
  })
  it('counts X links as 23 characters', () => {
    expect(xLength('hi https://nextquark.in/invite/ABCDEFGH')).toBe(3 + 23)
  })
})

describe('website checks (§8.4)', () => {
  const errors = (k: string, v: JsonObject) => checkSection(k, v, D[k], D[k]).filter(i => i.severity === 'error')
  it('requires the nextquark.in invite domain', () => {
    expect(errors('copy.share', { ...D['copy.share'], invite_link_base: 'https://evil.com/' })).toHaveLength(1)
  })
  it('rejects names outside the allowed lists', () => {
    expect(errors('features', { ...D.features, share_targets: ['story', 'tiktok'] })).toHaveLength(1)
    expect(errors('job_card', setAt(D.job_card, ['chips', 'hidden'], ['salary', 'salary']))).toHaveLength(1)
  })
  it('rejects unknown fields but allows new map keys', () => {
    expect(errors('limits', { ...D.limits, bonus: 3 })).toHaveLength(1)
    expect(errors('feed', setAt(D.feed, ['starting_levels', 'student'], [0, 1]))).toHaveLength(0)
  })
  it('checks starting level ranges', () => {
    expect(errors('feed', setAt(D.feed, ['starting_levels', 'junior'], [3, 1]))).toHaveLength(1)
    expect(errors('feed', setAt(D.feed, ['starting_levels', 'junior'], [0, 6]))).toHaveLength(1)
  })
  it('warns when default/highlighted plans are hidden', () => {
    const v = { ...D.paywall, hidden_plans: ['pro', 'starter'] }
    const paths = checkSection('paywall', v, D.paywall).map(i => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(['default_plan', 'highlighted_plan']))
  })
  it('warns on big jumps in limits', () => {
    const w = checkSection('limits', { ...D.limits, free_swipes_per_cycle: 100 }, D.limits, D.limits)
    expect(w[0].message).toMatch(/Big jump/)
  })
})

describe('database problems', () => {
  it('maps problem text to a field path', () => {
    expect(pathFromProblem('.free_swipes_per_cycle must be a number (got string)')).toEqual(['free_swipes_per_cycle'])
    expect(pathFromProblem('.follow_items[1].label must be a string (got number)')).toEqual(['follow_items', '1', 'label'])
    expect(pathFromProblem('value must be an object (got array)')).toBeNull()
  })
})

describe('impact sentences', () => {
  it('states the limits effect in plain words', () => {
    const s = impactSentences('limits', D.limits, { ...D.limits, free_swipes_per_cycle: 15 }, D.limits)
    expect(s[0]).toBe('New free users will get 15 swipes per cycle; existing users at their next reset.')
  })
  it('only fires for feed_source within features', () => {
    expect(impactSentences('features', D.features, { ...D.features, splash_min_ms: 900 }, D.features)).toEqual([])
    expect(impactSentences('features', D.features, { ...D.features, feed_source: 'server' }, D.features)).toHaveLength(1)
  })
  it('describes hiding a plan', () => {
    const s = impactSentences('paywall', D.paywall, { ...D.paywall, hidden_plans: ['ultra'] as Json }, D.paywall)
    expect(s[0]).toBe('These plans will no longer be offered: ultra.')
  })
})
