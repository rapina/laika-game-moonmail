export type JobId = 'ramps' | 'bumpers' | 'lanes'
export type RampSide = 'left' | 'right'
export type LaneId = 0 | 1 | 2

export const SCORE = {
    skillShot: 25_000,
    target: 2_000,
    lane: 3_000,
    bumper: 1_000,
    ramp: 8_000,
    job: 75_000,
    lock: 40_000,
    jackpot: 100_000,
    superJackpot: 500_000,
} as const

export const JOB_ORDER: readonly JobId[] = ['ramps', 'bumpers', 'lanes']
export const PLUNGER_TRAVEL_PX = 48

export interface MoonmailRulesState {
    score: number
    targets: [boolean, boolean, boolean]
    scoopLit: boolean
    activeJob: JobId | null
    jobSeconds: number
    rampProgress: number
    nextJobRamp: RampSide
    bumperProgress: number
    laneProgress: [boolean, boolean, boolean]
    laneScoopReady: boolean
    completedJobs: JobId[]
    kickbackReady: boolean
    kickbackAwarded: boolean
    lockOpen: boolean
    locks: number
    multiball: boolean
    jackpots: number
    nextJackpotRamp: RampSide
    superLit: boolean
    success: boolean
    skillShotLane: LaneId | null
}

export function createRulesState(): MoonmailRulesState {
    return {
        score: 0,
        targets: [false, false, false],
        scoopLit: false,
        activeJob: null,
        jobSeconds: 0,
        rampProgress: 0,
        nextJobRamp: 'left',
        bumperProgress: 0,
        laneProgress: [false, false, false],
        laneScoopReady: false,
        completedJobs: [],
        kickbackReady: false,
        kickbackAwarded: false,
        lockOpen: false,
        locks: 0,
        multiball: false,
        jackpots: 0,
        nextJackpotRamp: 'left',
        superLit: false,
        success: false,
        skillShotLane: null,
    }
}

export function strengthLane(strength: number): LaneId {
    if (strength < 0.34) return 0
    if (strength < 0.67) return 1
    return 2
}

export function plungerPowerForDrag(dragPx: number): number {
    return Math.max(0, Math.min(1, dragPx / PLUNGER_TRAVEL_PX))
}

export function awardSkillShot(state: MoonmailRulesState, lane: LaneId): boolean {
    if (state.skillShotLane !== null) return false
    state.skillShotLane = lane
    state.score += SCORE.skillShot
    return true
}

export function hitTarget(state: MoonmailRulesState, index: LaneId): boolean {
    state.score += SCORE.target
    if (state.targets[index]) return false
    state.targets[index] = true
    if (state.targets.every(Boolean)) {
        state.scoopLit = true
        if (!state.kickbackAwarded) {
            state.kickbackAwarded = true
            state.kickbackReady = true
        }
    }
    return true
}

export type ScoopResult = 'none' | 'job-start' | 'job-complete' | 'super'

export function enterScoop(state: MoonmailRulesState): ScoopResult {
    if (state.multiball && state.superLit) {
        state.score += SCORE.superJackpot
        state.success = true
        return 'super'
    }
    if (state.activeJob === 'lanes' && state.laneScoopReady) {
        completeJob(state, 'lanes')
        return 'job-complete'
    }
    if (!state.scoopLit || state.activeJob) return 'none'
    const next = JOB_ORDER.find((job) => !state.completedJobs.includes(job))
    if (!next) return 'none'
    state.scoopLit = false
    state.targets = [false, false, false]
    state.activeJob = next
    state.jobSeconds = 30
    state.rampProgress = 0
    state.nextJobRamp = 'left'
    state.bumperProgress = 0
    state.laneProgress = [false, false, false]
    state.laneScoopReady = false
    return 'job-start'
}

export type RampResult = 'score' | 'job-progress' | 'job-complete' | 'jackpot'

export function hitRamp(state: MoonmailRulesState, side: RampSide): RampResult {
    state.score += SCORE.ramp
    if (state.multiball && !state.superLit && side === state.nextJackpotRamp) {
        state.score += SCORE.jackpot
        state.jackpots += 1
        state.nextJackpotRamp = side === 'left' ? 'right' : 'left'
        if (state.jackpots >= 3) state.superLit = true
        return 'jackpot'
    }
    if (state.activeJob !== 'ramps' || side !== state.nextJobRamp) return 'score'
    state.rampProgress += 1
    state.nextJobRamp = side === 'left' ? 'right' : 'left'
    if (state.rampProgress >= 4) {
        completeJob(state, 'ramps')
        return 'job-complete'
    }
    return 'job-progress'
}

export function hitBumper(state: MoonmailRulesState): boolean {
    state.score += SCORE.bumper
    if (state.activeJob !== 'bumpers') return false
    state.bumperProgress += 1
    if (state.bumperProgress >= 12) completeJob(state, 'bumpers')
    return true
}

export function hitLane(state: MoonmailRulesState, lane: LaneId): boolean {
    state.score += SCORE.lane
    if (state.activeJob !== 'lanes') return false
    state.laneProgress[lane] = true
    state.laneScoopReady = state.laneProgress.every(Boolean)
    return true
}

export function tickJob(state: MoonmailRulesState, seconds: number): boolean {
    if (!state.activeJob) return false
    state.jobSeconds = Math.max(0, state.jobSeconds - seconds)
    if (state.jobSeconds > 0) return false
    state.activeJob = null
    state.rampProgress = 0
    state.bumperProgress = 0
    state.laneProgress = [false, false, false]
    state.laneScoopReady = false
    state.targets = [false, false, false]
    state.scoopLit = false
    return true
}

export function lockBall(state: MoonmailRulesState): 'none' | 'locked' | 'multiball' {
    if (!state.lockOpen || state.multiball) return 'none'
    state.locks += 1
    state.score += SCORE.lock
    if (state.locks < 2) return 'locked'
    state.multiball = true
    state.nextJackpotRamp = 'left'
    return 'multiball'
}

export function useKickback(state: MoonmailRulesState): boolean {
    if (!state.kickbackReady) return false
    state.kickbackReady = false
    return true
}

function completeJob(state: MoonmailRulesState, job: JobId): void {
    if (!state.completedJobs.includes(job)) state.completedJobs.push(job)
    state.score += SCORE.job
    state.activeJob = null
    state.jobSeconds = 0
    state.scoopLit = false
    state.targets = [false, false, false]
    if (state.completedJobs.length === JOB_ORDER.length) state.lockOpen = true
}
