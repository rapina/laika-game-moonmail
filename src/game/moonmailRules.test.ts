import { describe, expect, it } from 'vitest'
import {
    awardSkillShot,
    createRulesState,
    enterScoop,
    hitBumper,
    hitLane,
    hitRamp,
    hitTarget,
    lockBall,
    plungerPowerForDrag,
    strengthLane,
    tickJob,
    useKickback,
} from './moonmailRules'

function lightScoop(state: ReturnType<typeof createRulesState>) {
    hitTarget(state, 0)
    hitTarget(state, 1)
    hitTarget(state, 2)
}

describe('Moonmail pinball rules', () => {
    it('maps three plunger strength bands to distinct skill-shot lanes once', () => {
        expect([strengthLane(0.2), strengthLane(0.5), strengthLane(0.9)]).toEqual([0, 1, 2])
        const state = createRulesState()
        expect(awardSkillShot(state, 1)).toBe(true)
        expect(awardSkillShot(state, 2)).toBe(false)
        expect(state.skillShotLane).toBe(1)
    })

    it('reaches full plunger power at the visible 48px handle travel', () => {
        expect(plungerPowerForDrag(0)).toBe(0)
        expect(plungerPowerForDrag(24)).toBe(0.5)
        expect(plungerPowerForDrag(48)).toBe(1)
        expect(plungerPowerForDrag(80)).toBe(1)
    })

    it('lights the scoop and awards exactly one kickback from the first bank', () => {
        const state = createRulesState()
        lightScoop(state)
        expect(state.scoopLit).toBe(true)
        expect(useKickback(state)).toBe(true)
        expect(useKickback(state)).toBe(false)
        enterScoop(state)
        lightScoop(state)
        expect(state.kickbackReady).toBe(false)
    })

    it('requires four alternating ramps and rejects repeated sides', () => {
        const state = createRulesState()
        lightScoop(state)
        expect(enterScoop(state)).toBe('job-start')
        hitRamp(state, 'left')
        hitRamp(state, 'left')
        expect(state.rampProgress).toBe(1)
        hitRamp(state, 'right')
        hitRamp(state, 'left')
        expect(hitRamp(state, 'right')).toBe('job-complete')
        expect(state.completedJobs).toEqual(['ramps'])
    })

    it('resets an unfinished timed job when its thirty seconds expire', () => {
        const state = createRulesState()
        lightScoop(state)
        enterScoop(state)
        hitRamp(state, 'left')
        expect(tickJob(state, 29.5)).toBe(false)
        expect(tickJob(state, 0.5)).toBe(true)
        expect(state.activeJob).toBeNull()
        expect(state.rampProgress).toBe(0)
        expect(state.completedJobs).toHaveLength(0)
    })

    it('completes bumper and lane-then-scoop jobs before opening lock', () => {
        const state = createRulesState()
        state.completedJobs.push('ramps')
        lightScoop(state)
        enterScoop(state)
        for (let i = 0; i < 12; i++) hitBumper(state)
        expect(state.completedJobs).toEqual(['ramps', 'bumpers'])
        lightScoop(state)
        enterScoop(state)
        hitLane(state, 2); hitLane(state, 0); hitLane(state, 1)
        expect(state.laneScoopReady).toBe(true)
        expect(enterScoop(state)).toBe('job-complete')
        expect(state.lockOpen).toBe(true)
    })

    it('locks two balls, starts three-ball rules, alternates jackpots, then lights super', () => {
        const state = createRulesState()
        state.lockOpen = true
        expect(lockBall(state)).toBe('locked')
        expect(lockBall(state)).toBe('multiball')
        expect(hitRamp(state, 'right')).toBe('score')
        expect(hitRamp(state, 'left')).toBe('jackpot')
        expect(hitRamp(state, 'right')).toBe('jackpot')
        expect(hitRamp(state, 'left')).toBe('jackpot')
        expect(state.superLit).toBe(true)
        expect(enterScoop(state)).toBe('super')
        expect(state.success).toBe(true)
    })
})
