import {
    Application,
    Assets,
    Container,
    Graphics,
    Sprite,
    Text,
    Texture,
} from 'pixi.js'
const artPath = (name: string) => `art/${name}`
import { APP_CONFIG } from '../appConfig'
import { getLocale } from '../i18n'
import type { GameCallbacks, GameRuntime } from './types'
import { MoonmailAudio, type MoonmailSound } from './MoonmailAudio'
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
    PLUNGER_TRAVEL_PX,
    strengthLane,
    tickJob,
    useKickback,
    type JobId,
    type LaneId,
    type MoonmailRulesState,
    type RampSide,
} from './moonmailRules'

type Locale = 'ko' | 'en'
type Control = 'left' | 'right' | 'plunger' | 'table'

interface Ball {
    id: number
    x: number
    y: number
    vx: number
    vy: number
    age: number
    saveUntil: number
    saveUsed: boolean
    waiting: boolean
    lane: LaneId
    sprite: Sprite
    halo: Graphics
    trail: { x: number; y: number }[]
    contacts: Set<string>
    swallowedUntil: number
}

interface PointerTrack {
    id: number
    control: Control
    x0: number
    y0: number
    x: number
    y: number
    started: number
}

interface Flipper {
    side: RampSide
    pivotX: number
    pivotY: number
    angle: number
    target: number
    active: boolean
    sprite: Sprite
}

const W = 256
const H = 448
const BALL_R = 4
const FIXED_DT = 1 / 120
const JOB_NAME: Record<Locale, Record<JobId, string>> = {
    ko: { ramps: '교차 배송', bumpers: '분류 폭주', lanes: '새벽 노선' },
    en: { ramps: 'CROSS ROUTE', bumpers: 'SORT RUSH', lanes: 'DAWN ROUTE' },
}
const TEXT = {
    ko: {
        ball: '볼', jobs: '작업', lock: '락', pull: '플런저를 아래로 당겨 발사',
        save: '볼 세이브', kickback: '킥백!', scoop: '스쿱 점등',
        jobStart: '작업 시작', jobDone: '배송 완료', jobFail: '시간 초과',
        multiball: 'DAWN EXPRESS · 3볼', jackpot: '잭팟', super: '슈퍼 잭팟 점등',
        success: 'DAWN EXPRESS 출발!', failed: '새벽 마감 종료',
        restart: '화면을 눌러 다시 시작', left: '좌', right: '우',
    },
    en: {
        ball: 'BALL', jobs: 'JOBS', lock: 'LOCK', pull: 'DRAG PLUNGER DOWN',
        save: 'BALL SAVED', kickback: 'KICKBACK!', scoop: 'SCOOP LIT',
        jobStart: 'JOB START', jobDone: 'MAIL CLEARED', jobFail: 'TIME EXPIRED',
        multiball: 'DAWN EXPRESS · 3-BALL', jackpot: 'JACKPOT', super: 'SUPER LIT',
        success: 'DAWN EXPRESS AWAY!', failed: 'SHIFT CLOSED',
        restart: 'TAP TO RESTART', left: 'L', right: 'R',
    },
} as const

const BUMPERS = [
    { x: 92, y: 139 },
    { x: 128, y: 154 },
    { x: 164, y: 139 },
]
const TARGETS = [101, 128, 155] as const
const LANES = [58, 128, 198] as const

export class MoonmailGame implements GameRuntime {
    constructor(private readonly assetBaseUrl = '/') {}

    private assetUrl(name: string): string {
        return new URL(artPath(name), new URL(this.assetBaseUrl, window.location.href)).href
    }

    private app: Application | null = null
    private callbacks: GameCallbacks | null = null
    private rules: MoonmailRulesState = createRulesState()
    private balls: Ball[] = []
    private ballLayer = new Container()
    private ballTrailLayer = new Graphics()
    private fxLayer = new Container()
    private lightLayer = new Graphics()
    private hudLayer = new Container()
    private leftFlipper: Flipper | null = null
    private rightFlipper: Flipper | null = null
    private pointers = new Map<number, PointerTrack>()
    private pressedKeys = new Set<string>()
    private audio = new MoonmailAudio()
    private locale: Locale = 'ko'
    private localeExplicit = false
    private scoreText: Text | null = null
    private statusText: Text | null = null
    private objectiveText: Text | null = null
    private plungerText: Text | null = null
    private messageText: Text | null = null
    private messageUntil = 0
    private plungerPower = 0
    private ballsRemaining = 3
    private nextBallId = 1
    private elapsed = 0
    private accumulator = 0
    private paused = false
    private over = false
    private resultSent = false
    private success = false
    private restartAt = 0
    private serveAt = 0
    private lastNudge = -1
    private resizeObs: ResizeObserver | null = null
    private destroyed = false
    private keyDown = (event: KeyboardEvent) => this.onKeyDown(event)
    private keyUp = (event: KeyboardEvent) => this.onKeyUp(event)

    async mount(container: HTMLElement, callbacks: GameCallbacks): Promise<void> {
        this.callbacks = callbacks
        if (!this.localeExplicit) {
            const requestedLocale = new URLSearchParams(window.location.search).get('lang') ?? getLocale()
            this.locale = requestedLocale === 'en' ? 'en' : 'ko'
        }
        const app = new Application()
        await app.init({
            width: W,
            height: H,
            backgroundColor: 0x080b1a,
            antialias: false,
            // The scene stays 256×448 logical pixels. A denser backing store keeps
            // the nearest-neighbor upscale crisp after the phone frame enlarges it.
            resolution: Math.min(6, Math.max(2, (window.devicePixelRatio || 1) * 2)),
            autoDensity: true,
            roundPixels: true,
        })
        if (this.destroyed) {
            app.destroy(true, { children: true })
            return
        }
        this.app = app
        app.canvas.classList.add('moonmail-canvas')
        container.appendChild(app.canvas)
        this.fit(container)
        this.resizeObs = new ResizeObserver(() => this.fit(container))
        this.resizeObs.observe(container)

        const [tableTexture, ballTexture, leftTexture, rightTexture, sparkTexture] = await Promise.all([
            Assets.load<Texture>(this.assetUrl('moonmail-table.png')),
            Assets.load<Texture>(this.assetUrl('mail-ball.png')),
            Assets.load<Texture>(this.assetUrl('flipper-left.png')),
            Assets.load<Texture>(this.assetUrl('flipper-right.png')),
            Assets.load<Texture>(this.assetUrl('mail-spark.png')),
        ])
        for (const texture of [tableTexture, ballTexture, leftTexture, rightTexture, sparkTexture]) {
            texture.source.scaleMode = 'nearest'
        }
        if (this.destroyed) return

        const table = new Sprite(tableTexture)
        table.width = W
        table.height = H
        app.stage.addChild(table, this.lightLayer, this.ballTrailLayer, this.ballLayer, this.fxLayer, this.hudLayer)
        this.createFlippers(leftTexture, rightTexture)
        this.createHud()
        this.installInput()
        this.resetRun()
        this.renderLights()
        this.updateHud()

        app.ticker.add((ticker) => this.frame(Math.min(50, ticker.deltaMS) / 1000))
        ;(globalThis as Record<string, unknown>).__forceGameOver = () => this.endRun(false)
        ;(globalThis as Record<string, unknown>).__gameDesignSize = { w: W, h: H }
        ;(globalThis as Record<string, unknown>).__gameOverUiBoxes = [
            { name: 'result-title', x: 22, y: 142, w: 212, h: 52 },
            { name: 'result-stats', x: 36, y: 208, w: 184, h: 82 },
            { name: 'restart', x: 28, y: 316, w: 200, h: 34 },
        ]
    }

    private fit(container: HTMLElement): void {
        if (!this.app) return
        const cw = container.clientWidth
        const ch = container.clientHeight
        if (!cw || !ch) return
        const scale = Math.min(cw / W, ch / H)
        this.app.canvas.style.width = `${Math.floor(W * scale)}px`
        this.app.canvas.style.height = `${Math.floor(H * scale)}px`
    }

    private createFlippers(leftTexture: Texture, rightTexture: Texture): void {
        const left = new Sprite(leftTexture)
        left.anchor.set(6 / 40, 0.5)
        left.position.set(82, 388)
        const right = new Sprite(rightTexture)
        right.anchor.set(33 / 40, 0.5)
        right.position.set(174, 388)
        this.fxLayer.addChild(left, right)
        this.leftFlipper = { side: 'left', pivotX: 82, pivotY: 388, angle: 0.27, target: 0.27, active: false, sprite: left }
        this.rightFlipper = { side: 'right', pivotX: 174, pivotY: 388, angle: Math.PI - 0.27, target: Math.PI - 0.27, active: false, sprite: right }
    }

    private createHud(): void {
        const panel = new Graphics().rect(0, 0, W, 58).fill({ color: 0x080b1a, alpha: 0.92 })
        panel.rect(0, 57, W, 1).fill(0x36b6a2)
        this.hudLayer.addChild(panel)
        this.scoreText = this.pixelText('', 8, 4, 11, 0xffd477)
        this.statusText = this.pixelText('', 8, 20, 7, 0x8be0c2)
        this.objectiveText = this.pixelText('', 8, 36, 7, 0xffd477)
        this.messageText = this.pixelText('', W / 2, 61, 10, 0xf2efe2, true)
        this.messageText.visible = false
        this.plungerText = this.pixelText('', 238, 324, 7, 0xffd477, true)
        this.plungerText.anchor.set(0.5, 0)
        this.plungerText.visible = false
        this.hudLayer.addChild(this.scoreText, this.statusText, this.objectiveText, this.messageText, this.plungerText)
    }

    private pixelText(text: string, x: number, y: number, size: number, color: number, centered = false): Text {
        const item = new Text({
            text,
            style: {
                fontFamily: 'Galmuri11, monospace',
                fontSize: size,
                fontWeight: 'bold',
                fill: color,
                stroke: { color: 0x080b1a, width: 3 },
                align: centered ? 'center' : 'left',
            },
        })
        if (centered) item.anchor.set(0.5, 0)
        item.position.set(x, y)
        item.resolution = 1
        return item
    }

    private installInput(): void {
        const stage = this.app!.stage
        stage.eventMode = 'static'
        stage.hitArea = this.app!.screen
        stage.on('pointerdown', (e) => this.pointerDown(e.pointerId, e.global.x, e.global.y))
        stage.on('pointermove', (e) => this.pointerMove(e.pointerId, e.global.x, e.global.y))
        stage.on('pointerup', (e) => this.pointerUp(e.pointerId, e.global.x, e.global.y))
        stage.on('pointerupoutside', (e) => this.pointerUp(e.pointerId, e.global.x, e.global.y))
        window.addEventListener('keydown', this.keyDown)
        window.addEventListener('keyup', this.keyUp)
    }

    private pointerDown(id: number, x: number, y: number): void {
        this.audio.unlock()
        if (this.over) {
            if (performance.now() >= this.restartAt) this.restartRun()
            return
        }
        let control: Control = 'table'
        if (x > 212 && y > 330 && this.balls.some((ball) => ball.waiting)) control = 'plunger'
        else if (y > 322) control = x < W / 2 ? 'left' : 'right'
        this.pointers.set(id, { id, control, x0: x, y0: y, x, y, started: performance.now() })
        if (control === 'left') this.setFlipper('left', true)
        if (control === 'right') this.setFlipper('right', true)
    }

    private pointerMove(id: number, x: number, y: number): void {
        const pointer = this.pointers.get(id)
        if (!pointer) return
        pointer.x = x
        pointer.y = y
        if (pointer.control === 'plunger') this.plungerPower = plungerPowerForDrag(y - pointer.y0)
    }

    private pointerUp(id: number, x: number, y: number): void {
        const pointer = this.pointers.get(id)
        if (!pointer) return
        this.pointers.delete(id)
        if (pointer.control === 'left' && !this.hasControl('left')) this.setFlipper('left', false)
        if (pointer.control === 'right' && !this.hasControl('right')) this.setFlipper('right', false)
        if (pointer.control === 'plunger') {
            this.launchWaitingBall(Math.max(0.12, this.plungerPower))
            this.plungerPower = 0
            return
        }
        const dx = x - pointer.x0
        const dy = y - pointer.y0
        const distance = Math.hypot(dx, dy)
        const duration = performance.now() - pointer.started
        if (pointer.control === 'table' && duration <= 180 && distance >= 18 && distance <= 70) {
            this.nudge(dx, dy)
        }
    }

    private hasControl(control: Control): boolean {
        return [...this.pointers.values()].some((pointer) => pointer.control === control)
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (this.pressedKeys.has(event.code)) return
        this.pressedKeys.add(event.code)
        this.audio.unlock()
        if (['ArrowLeft', 'KeyA'].includes(event.code)) this.setFlipper('left', true)
        if (['ArrowRight', 'KeyD'].includes(event.code)) this.setFlipper('right', true)
        if (event.code === 'Space') {
            event.preventDefault()
            if (this.over && performance.now() >= this.restartAt) this.restartRun()
            else this.launchWaitingBall(0.58)
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        this.pressedKeys.delete(event.code)
        if (['ArrowLeft', 'KeyA'].includes(event.code) && !this.pressedKeys.has('ArrowLeft') && !this.pressedKeys.has('KeyA')) this.setFlipper('left', false)
        if (['ArrowRight', 'KeyD'].includes(event.code) && !this.pressedKeys.has('ArrowRight') && !this.pressedKeys.has('KeyD')) this.setFlipper('right', false)
    }

    private setFlipper(side: RampSide, active: boolean): void {
        const flipper = side === 'left' ? this.leftFlipper : this.rightFlipper
        if (!flipper || flipper.active === active) return
        flipper.active = active
        flipper.target = side === 'left'
            ? (active ? -0.52 : 0.27)
            : (active ? Math.PI + 0.52 : Math.PI - 0.27)
        if (active) this.audio.play('flipper')
    }

    private nudge(dx: number, dy: number): void {
        if (this.elapsed - this.lastNudge < 0.35) return
        this.lastNudge = this.elapsed
        const scale = 72 / Math.max(18, Math.hypot(dx, dy))
        for (const ball of this.balls) {
            if (ball.waiting) continue
            ball.vx += dx * scale
            ball.vy += Math.min(0, dy) * scale * 0.7 - 18
        }
        this.audio.play('nudge')
        this.flash('NUDGE', 0x8be0c2, 0.5)
    }

    private resetRun(): void {
        this.clearResultOverlay()
        this.rules = createRulesState()
        this.ballsRemaining = 3
        this.elapsed = 0
        this.accumulator = 0
        this.over = false
        this.resultSent = false
        this.success = false
        this.serveAt = 0
        this.nextBallId = 1
        this.clearBalls()
        this.serveBall(true)
        this.flash(TEXT[this.locale].pull, 0xffd477, 3)
        this.renderLights()
        this.updateHud()
    }

    restartRun(): void {
        this.resetRun()
    }

    private clearBalls(): void {
        for (const ball of this.balls) {
            ball.sprite.destroy()
            ball.halo.destroy()
        }
        this.balls = []
        this.ballTrailLayer.clear()
    }

    private serveBall(waiting: boolean): Ball {
        const texture = Assets.get<Texture>(this.assetUrl('mail-ball.png'))
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5)
        sprite.position.set(231, 401)
        const halo = new Graphics().circle(0, 0, 7).fill({ color: 0x8be0c2, alpha: 0.2 })
        halo.position.set(231, 401)
        this.ballLayer.addChild(halo, sprite)
        const ball: Ball = {
            id: this.nextBallId++,
            x: 231,
            y: 401,
            vx: 0,
            vy: 0,
            age: 0,
            saveUntil: 0,
            saveUsed: false,
            waiting,
            lane: 1,
            sprite,
            halo,
            trail: [],
            contacts: new Set(),
            swallowedUntil: 0,
        }
        this.balls.push(ball)
        return ball
    }

    private launchWaitingBall(power: number): void {
        const ball = this.balls.find((item) => item.waiting)
        if (!ball || this.over) return
        const strength = Math.max(0, Math.min(1, power))
        ball.waiting = false
        ball.lane = strengthLane(strength)
        ball.vx = 0
        ball.vy = -(230 + strength * 170)
        ball.age = 0
        ball.saveUntil = this.elapsed + 8
        this.audio.play('launch')
        this.flash(`${TEXT[this.locale].ball} ${4 - this.ballsRemaining} · ${Math.round(strength * 100)}%`, 0xffd477, 1)
    }

    private frame(delta: number): void {
        if (this.paused || this.over) return
        this.elapsed += delta
        if (this.messageText && this.elapsed >= this.messageUntil) this.messageText.visible = false
        this.accumulator = Math.min(0.08, this.accumulator + delta)
        while (this.accumulator >= FIXED_DT) {
            this.step(FIXED_DT)
            this.accumulator -= FIXED_DT
        }
        this.animateFlippers(delta)
        this.renderBallTrails()
        this.renderLights()
        this.updateHud()
    }

    private step(dt: number): void {
        if (tickJob(this.rules, dt)) {
            this.audio.play('drain')
            this.flash(TEXT[this.locale].jobFail, 0xe75b55, 1.8)
        }
        if (this.serveAt > 0 && this.elapsed >= this.serveAt && this.balls.length === 0) {
            this.serveAt = 0
            this.serveBall(true)
            this.flash(TEXT[this.locale].pull, 0xffd477, 2)
        }

        for (const ball of [...this.balls]) {
            if (ball.waiting) {
                ball.y = 401 + this.plungerPower * 15
                this.syncBall(ball)
                continue
            }
            if (ball.swallowedUntil > this.elapsed) continue
            if (ball.swallowedUntil !== 0) {
                ball.swallowedUntil = 0
                ball.vx = (Math.random() - 0.5) * 50
                ball.vy = -165
            }
            ball.age += dt
            const lateGravity = ball.age > 18 && !this.rules.multiball ? 520 : 0
            ball.vy += (108 + lateGravity) * dt
            ball.x += ball.vx * dt
            ball.y += ball.vy * dt
            ball.vx *= 0.9992
            ball.vy *= 0.9995
            this.collideWalls(ball)
            this.collideFlipper(ball, this.leftFlipper)
            this.collideFlipper(ball, this.rightFlipper)
            this.checkFeatures(ball)
            if (!this.balls.includes(ball)) continue
            this.syncBall(ball)
            if (ball.y > H + 10) this.drainBall(ball)
        }
    }

    private animateFlippers(dt: number): void {
        for (const flipper of [this.leftFlipper, this.rightFlipper]) {
            if (!flipper) continue
            const speed = flipper.active ? 18 : 12
            flipper.angle += (flipper.target - flipper.angle) * Math.min(1, speed * dt)
            flipper.sprite.rotation = flipper.side === 'left' ? flipper.angle : flipper.angle - Math.PI
        }
    }

    private collideWalls(ball: Ball): void {
        const bounce = 0.79
        if (ball.y < 49) { ball.y = 49; ball.vy = Math.abs(ball.vy) * bounce }
        if (ball.x < 20) { ball.x = 20; ball.vx = Math.abs(ball.vx) * bounce }
        if (ball.x > 236) { ball.x = 236; ball.vx = -Math.abs(ball.vx) * bounce }
        // Shooter lane remains isolated until the ball reaches its skill-shot guide.
        if (ball.x > 220 && ball.y > 78 && ball.vy < 0) ball.x = Math.max(226, ball.x)
        if (ball.y <= 82 && ball.x > 218 && !ball.contacts.has('skill')) {
            const x = LANES[ball.lane]
            ball.x = x
            ball.y = 70
            ball.vx = (ball.lane - 1) * 28
            ball.vy = 92
            ball.contacts.add('skill')
            awardSkillShot(this.rules, ball.lane)
            this.audio.play('lane')
            this.flash(`SKILL SHOT · ${ball.lane + 1}`, 0xffd477, 1.4)
        }
        // Slings guide balls toward the flippers while leaving true outlanes.
        if (ball.y > 330 && ball.y < 390 && ball.x > 43 && ball.x < 73 && ball.vx < 0) {
            ball.vx = Math.abs(ball.vx) + 38
        }
        if (ball.y > 330 && ball.y < 390 && ball.x > 183 && ball.x < 213 && ball.vx > 0) {
            ball.vx = -Math.abs(ball.vx) - 38
        }
        // One rewarded left kickback.
        if (ball.y > 395 && ball.x < 50 && ball.contacts.has('playfield') && useKickback(this.rules)) {
            ball.y = 360
            ball.vx = 74
            ball.vy = -245
            this.audio.play('save')
            this.flash(TEXT[this.locale].kickback, 0x8be0c2, 1.2)
        }
        if (ball.y < 330) ball.contacts.add('playfield')
    }

    private collideFlipper(ball: Ball, flipper: Flipper | null): void {
        if (!flipper || ball.waiting || ball.y < 366 || ball.y > 410) return
        const length = 38
        const ex = flipper.pivotX + Math.cos(flipper.angle) * length
        const ey = flipper.pivotY + Math.sin(flipper.angle) * length
        const sx = ex - flipper.pivotX
        const sy = ey - flipper.pivotY
        const t = Math.max(0, Math.min(1, ((ball.x - flipper.pivotX) * sx + (ball.y - flipper.pivotY) * sy) / (length * length)))
        const nxp = flipper.pivotX + sx * t
        const nyp = flipper.pivotY + sy * t
        let nx = ball.x - nxp
        let ny = ball.y - nyp
        const distance = Math.hypot(nx, ny)
        if (distance > BALL_R + 3 || distance === 0) return
        nx /= distance
        ny /= distance
        ball.x = nxp + nx * (BALL_R + 3.1)
        ball.y = nyp + ny * (BALL_R + 3.1)
        const dot = ball.vx * nx + ball.vy * ny
        if (dot < 0) {
            ball.vx -= 1.85 * dot * nx
            ball.vy -= 1.85 * dot * ny
        }
        if (flipper.active) {
            const impulse = 225 * (0.45 + t * 0.75)
            ball.vx += (flipper.side === 'left' ? 1 : -1) * impulse * 0.34
            ball.vy -= impulse
        }
        this.capVelocity(ball)
    }

    private checkFeatures(ball: Ball): void {
        for (let i = 0; i < BUMPERS.length; i++) {
            const bumper = BUMPERS[i]
            const dx = ball.x - bumper.x
            const dy = ball.y - bumper.y
            const distance = Math.hypot(dx, dy)
            this.featureContact(ball, `bumper-${i}`, distance < 18, () => {
                const scale = 210 / Math.max(1, distance)
                ball.vx = dx * scale
                ball.vy = dy * scale
                hitBumper(this.rules)
                this.audio.play('bumper')
                this.spark(bumper.x, bumper.y, 0xf2a33a)
            })
        }
        for (let i = 0; i < TARGETS.length; i++) {
            const dx = ball.x - TARGETS[i]
            const dy = ball.y - 257
            this.featureContact(ball, `target-${i}`, Math.abs(dx) < 13 && Math.abs(dy) < 12, () => {
                ball.vy = Math.abs(ball.vy) + 75
                const newlyDown = hitTarget(this.rules, i as LaneId)
                this.audio.play('target')
                this.spark(TARGETS[i], 257, newlyDown ? 0xffd477 : 0x33507a)
                if (this.rules.scoopLit) this.flash(TEXT[this.locale].scoop, 0xffd477, 1.2)
            })
        }
        for (let i = 0; i < LANES.length; i++) {
            const inside = ball.y > 54 && ball.y < 94 && Math.abs(ball.x - LANES[i]) < 10
            this.featureContact(ball, `lane-${i}`, inside, () => {
                hitLane(this.rules, i as LaneId)
                this.audio.play('lane')
                this.spark(LANES[i], 70, 0x8be0c2)
            })
        }
        this.checkRamp(ball, 'left', ball.x > 53 && ball.x < 87 && ball.y > 171 && ball.y < 217)
        this.checkRamp(ball, 'right', ball.x > 169 && ball.x < 203 && ball.y > 171 && ball.y < 217)

        const scoopDistance = Math.hypot(ball.x - 128, ball.y - 209)
        this.featureContact(ball, 'scoop', scoopDistance < 15, () => {
            const result = enterScoop(this.rules)
            if (result === 'none') {
                ball.vy = Math.abs(ball.vy) + 65
                return
            }
            ball.x = 128
            ball.y = 209
            ball.vx = 0
            ball.vy = 0
            ball.swallowedUntil = this.elapsed + 0.55
            this.audio.play(result === 'super' ? 'super' : 'scoop')
            if (result === 'job-start' && this.rules.activeJob) this.flash(`${TEXT[this.locale].jobStart} · ${JOB_NAME[this.locale][this.rules.activeJob]}`, 0x8be0c2, 2)
            if (result === 'job-complete') this.onJobComplete()
            if (result === 'super') this.endRun(true)
        })

        const lockInside = this.rules.lockOpen && ball.x > 27 && ball.x < 59 && ball.y > 98 && ball.y < 149
        this.featureContact(ball, 'lock', lockInside, () => this.onLock(ball))
    }

    private checkRamp(ball: Ball, side: RampSide, inside: boolean): void {
        this.featureContact(ball, `ramp-${side}`, inside, () => {
            const beforeJobs = this.rules.completedJobs.length
            const result = hitRamp(this.rules, side)
            ball.x = side === 'left' ? 77 : 179
            ball.y = 174
            ball.vx = side === 'left' ? 65 : -65
            ball.vy = 112
            this.audio.play(result === 'jackpot' ? 'jackpot' : 'ramp')
            this.spark(ball.x, ball.y, result === 'jackpot' ? 0xffd477 : 0x36b6a2)
            if (result === 'jackpot') {
                this.flash(`${TEXT[this.locale].jackpot} ${this.rules.jackpots}/3`, 0xffd477, 1.3)
                if (this.rules.superLit) this.flash(TEXT[this.locale].super, 0xf2a33a, 2)
            }
            if (this.rules.completedJobs.length > beforeJobs) this.onJobComplete()
        })
    }

    private featureContact(ball: Ball, key: string, inside: boolean, enter: () => void): void {
        if (inside) {
            if (!ball.contacts.has(key)) {
                ball.contacts.add(key)
                enter()
            }
        } else {
            ball.contacts.delete(key)
        }
    }

    private onJobComplete(): void {
        this.audio.play('job')
        this.flash(`${TEXT[this.locale].jobDone} · ${this.rules.completedJobs.length}/3`, 0x8be0c2, 1.8)
        if (this.rules.lockOpen) this.flash(`${TEXT[this.locale].lock} OPEN`, 0xffd477, 2.2)
    }

    private onLock(ball: Ball): void {
        const result = lockBall(this.rules)
        if (result === 'none') return
        this.audio.play('lock')
        this.removeBall(ball)
        this.flash(`${TEXT[this.locale].lock} ${this.rules.locks}/2`, 0xffd477, 1.8)
        if (result === 'locked') {
            this.serveAt = this.elapsed + 0.8
            return
        }
        this.serveAt = 0
        this.startMultiball()
    }

    private startMultiball(): void {
        this.clearBalls()
        for (let i = 0; i < 3; i++) {
            const ball = this.serveBall(false)
            ball.x = 112 + i * 16
            ball.y = 224 + i * 4
            ball.vx = (i - 1) * 94
            ball.vy = -185 - i * 25
            ball.saveUntil = this.elapsed + 10
            this.syncBall(ball)
        }
        this.audio.play('job')
        this.flash(TEXT[this.locale].multiball, 0xffd477, 2.5)
    }

    private drainBall(ball: Ball): void {
        if (!this.balls.includes(ball)) return
        if (ball.saveUntil > this.elapsed && !ball.saveUsed) {
            ball.saveUsed = true
            ball.x = 231
            ball.y = 401
            ball.vx = 0
            ball.vy = -290
            ball.saveUntil = 0
            ball.age = 0
            this.audio.play('save')
            this.flash(TEXT[this.locale].save, 0x8be0c2, 1.2)
            return
        }
        this.removeBall(ball)
        this.audio.play('drain')
        if (this.rules.multiball && this.balls.length > 0) {
            if (this.balls.length === 1) this.rules.multiball = false
            return
        }
        this.rules.multiball = false
        this.ballsRemaining -= 1
        if (this.ballsRemaining <= 0) {
            this.endRun(false)
            return
        }
        this.serveAt = this.elapsed + 0.9
    }

    private removeBall(ball: Ball): void {
        const index = this.balls.indexOf(ball)
        if (index >= 0) this.balls.splice(index, 1)
        ball.sprite.destroy()
        ball.halo.destroy()
    }

    private capVelocity(ball: Ball): void {
        const speed = Math.hypot(ball.vx, ball.vy)
        if (speed <= 430) return
        ball.vx = ball.vx / speed * 430
        ball.vy = ball.vy / speed * 430
    }

    private syncBall(ball: Ball): void {
        const x = Math.round(ball.x)
        const y = Math.round(ball.y)
        ball.sprite.position.set(x, y)
        ball.halo.position.set(x, y)
        ball.halo.alpha = 0.14 + (Math.sin(this.elapsed * 12 + ball.id) + 1) * 0.08
        if (!ball.waiting) {
            const last = ball.trail[ball.trail.length - 1]
            if (!last || Math.hypot(x - last.x, y - last.y) >= 5) {
                ball.trail.push({ x, y })
                if (ball.trail.length > 7) ball.trail.shift()
            }
        }
    }

    private renderBallTrails(): void {
        const trail = this.ballTrailLayer
        trail.clear()
        for (const ball of this.balls) {
            for (let i = 0; i < ball.trail.length; i++) {
                const point = ball.trail[i]
                const alpha = ((i + 1) / ball.trail.length) * 0.5
                const size = i >= ball.trail.length - 2 ? 3 : 2
                trail.rect(point.x - 1, point.y - 1, size, size).fill({ color: i % 2 ? 0x8be0c2 : 0xf2a33a, alpha })
            }
        }
    }

    private spark(x: number, y: number, tint: number): void {
        const texture = Assets.get<Texture>(this.assetUrl('mail-spark.png'))
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5)
        sprite.position.set(x, y)
        sprite.tint = tint
        this.fxLayer.addChild(sprite)
        const started = this.elapsed
        const tick = () => {
            const age = this.elapsed - started
            sprite.scale.set(1 + age * 2)
            sprite.alpha = Math.max(0, 1 - age * 3)
            if (age > 0.34 || sprite.destroyed) {
                this.app?.ticker.remove(tick)
                if (!sprite.destroyed) sprite.destroy()
            }
        }
        this.app?.ticker.add(tick)
    }

    private renderLights(): void {
        const g = this.lightLayer
        g.clear()
        // Input zones and plunger power.
        g.rect(0, 410, 110, 38).fill({ color: this.leftFlipper?.active ? 0x36b6a2 : 0x1d2850, alpha: 0.18 })
        g.rect(146, 410, 110, 38).fill({ color: this.rightFlipper?.active ? 0xf2a33a : 0x1d2850, alpha: 0.18 })
        if (this.balls.some((ball) => ball.waiting)) {
            const top = 357
            g.rect(240, top, 7, PLUNGER_TRAVEL_PX).fill(0x10152b)
            g.rect(240, 405 - this.plungerPower * PLUNGER_TRAVEL_PX, 7, this.plungerPower * PLUNGER_TRAVEL_PX).fill(0xf2a33a)
            for (let i = 0; i <= 4; i++) g.rect(237, 405 - i * 12, 3, 1).fill(i === 4 ? 0xffd477 : 0x33507a)
        }
        // Target, lane, scoop and lock lamps.
        const pulse = 0.55 + (Math.sin(this.elapsed * 7) + 1) * 0.2
        const bankNeeded = !this.rules.activeJob && !this.rules.lockOpen && !this.rules.scoopLit
        for (let i = 0; i < 3; i++) {
            if (this.rules.targets[i]) {
                g.circle(TARGETS[i], 269, 3).fill(0xffd477)
            } else if (bankNeeded) {
                g.rect(TARGETS[i] - 11, 247, 22, 21).stroke({ color: 0xffd477, width: 2, alpha: pulse })
                g.poly([TARGETS[i] - 4, 244, TARGETS[i], 248, TARGETS[i] + 4, 244]).fill({ color: 0xffd477, alpha: pulse })
            }
            if (this.rules.laneProgress[i]) g.rect(LANES[i] - 7, 93, 14, 2).fill(0x8be0c2)
            else if (this.rules.activeJob === 'lanes') g.rect(LANES[i] - 11, 56, 22, 38).stroke({ color: 0x8be0c2, width: 2, alpha: pulse })
        }
        if (this.rules.activeJob === 'bumpers') {
            for (const bumper of BUMPERS) g.circle(bumper.x, bumper.y, 18).stroke({ color: 0xf2a33a, width: 2, alpha: pulse })
        }
        if (this.rules.scoopLit || this.rules.laneScoopReady || this.rules.superLit) {
            const color = this.rules.superLit ? 0xffd477 : 0x36b6a2
            g.circle(128, 209, 20).stroke({ color, width: 3, alpha: pulse })
        }
        if (this.rules.lockOpen) g.rect(25, 96, 36, 55).stroke({ color: this.rules.locks === 1 ? 0xffd477 : 0x36b6a2, width: 3, alpha: pulse })
        if (this.rules.activeJob === 'ramps' || this.rules.multiball) {
            const side = this.rules.multiball ? this.rules.nextJackpotRamp : this.rules.nextJobRamp
            const x = side === 'left' ? 62 : 194
            g.poly([x - 10, 235, x, 224, x + 10, 235]).fill(this.rules.multiball ? 0xffd477 : 0x8be0c2)
        }
        if (this.rules.kickbackReady) g.rect(19, 350, 5, 47).fill(0x8be0c2)
    }

    private updateHud(): void {
        if (!this.scoreText || !this.statusText || !this.objectiveText || !this.plungerText) return
        this.scoreText.text = `${this.rules.score.toString().padStart(7, '0')}`
        const active = this.rules.activeJob
        const jobPart = active
            ? `${JOB_NAME[this.locale][active]} ${Math.ceil(this.rules.jobSeconds)}s ${this.jobProgress(active)}`
            : `${TEXT[this.locale].jobs} ${this.rules.completedJobs.length}/3`
        const ballNumber = Math.min(3, 4 - this.ballsRemaining)
        this.statusText.text = `${TEXT[this.locale].ball} ${ballNumber}/3  ·  ${jobPart}  ·  ${TEXT[this.locale].lock} ${this.rules.locks}/2`
        this.objectiveText.text = this.currentObjective()
        const waiting = this.balls.some((ball) => ball.waiting)
        this.plungerText.visible = waiting
        this.plungerText.text = `${Math.round(this.plungerPower * 100)}%\n↓100`
    }

    private currentObjective(): string {
        const ko = this.locale === 'ko'
        if (this.balls.some((ball) => ball.waiting)) return ko ? '당기기 ↓ 100% · 놓아서 발사' : 'PULL ↓ TO 100% · RELEASE'
        if (this.rules.multiball) {
            if (this.rules.superLit) return ko ? 'DAWN ▸ 중앙 태양 스쿱 = 슈퍼' : 'DAWN ▸ CENTER SUN SCOOP = SUPER'
            const side = this.rules.nextJackpotRamp === 'left' ? (ko ? '좌' : 'LEFT') : (ko ? '우' : 'RIGHT')
            return ko ? `DAWN ▸ ${side} 램프 잭팟 ${this.rules.jackpots}/3` : `DAWN ▸ ${side} RAMP JACKPOT ${this.rules.jackpots}/3`
        }
        if (this.rules.lockOpen) return ko ? `다음 ▸ 좌측 우편함 락 ${this.rules.locks}/2` : `NEXT ▸ LEFT MAILBOX LOCK ${this.rules.locks}/2`
        if (this.rules.activeJob === 'ramps') {
            const side = this.rules.nextJobRamp === 'left' ? (ko ? '좌' : 'LEFT') : (ko ? '우' : 'RIGHT')
            return ko ? `작업 ▸ ${side} 램프 다음 ${this.rules.rampProgress}/4` : `JOB ▸ ${side} RAMP NEXT ${this.rules.rampProgress}/4`
        }
        if (this.rules.activeJob === 'bumpers') return ko ? `작업 ▸ 분류 범퍼 ${this.rules.bumperProgress}/12` : `JOB ▸ SORT BUMPERS ${this.rules.bumperProgress}/12`
        if (this.rules.activeJob === 'lanes') {
            if (this.rules.laneScoopReady) return ko ? '작업 ▸ 중앙 태양 스쿱으로 완료' : 'JOB ▸ SUN SCOOP TO FINISH'
            const count = this.rules.laneProgress.filter(Boolean).length
            return ko ? `작업 ▸ 상단 3레인 ${count}/3` : `JOB ▸ TOP LANES ${count}/3`
        }
        if (this.rules.scoopLit) {
            const number = this.rules.completedJobs.length + 1
            return ko ? `다음 ▸ 중앙 태양 스쿱 → 작업 ${number}` : `NEXT ▸ SUN SCOOP → START JOB ${number}`
        }
        const down = this.rules.targets.filter(Boolean).length
        return ko ? `다음 ▸ 봉투 3개 ${down}/3 → 태양 스쿱` : `NEXT ▸ ENVELOPES ${down}/3 → SUN SCOOP`
    }

    private jobProgress(job: JobId): string {
        if (job === 'ramps') return `${this.rules.rampProgress}/4`
        if (job === 'bumpers') return `${this.rules.bumperProgress}/12`
        return `${this.rules.laneProgress.filter(Boolean).length}/3${this.rules.laneScoopReady ? '→S' : ''}`
    }

    private flash(message: string, color: number, seconds: number): void {
        if (!this.messageText) return
        this.messageText.text = message
        this.messageText.style.fill = color
        this.messageText.visible = true
        this.messageUntil = this.elapsed + seconds
    }

    private endRun(success: boolean): void {
        if (this.over) return
        this.over = true
        this.success = success
        this.rules.success = success
        this.restartAt = performance.now() + 700
        this.showResultOverlay()
        if (success) this.audio.play('super')
        else this.audio.play('drain')
        if (!this.resultSent) {
            this.resultSent = true
            this.callbacks?.onGameOver({
                score: this.rules.score,
                phase: this.rules.completedJobs.length,
                jobs: this.rules.completedJobs.length,
                jackpots: this.rules.jackpots,
                success,
            })
        }
    }

    private showResultOverlay(): void {
        const t = TEXT[this.locale]
        const overlay = new Graphics().rect(15, 112, 226, 264).fill({ color: 0x080b1a, alpha: 0.94 })
        overlay.rect(15, 112, 226, 264).stroke({ color: this.success ? 0xffd477 : 0x33507a, width: 3 })
        overlay.label = 'result-overlay'
        const title = this.pixelText(this.success ? t.success : t.failed, W / 2, 145, 16, this.success ? 0xffd477 : 0xf2efe2, true)
        const stats = this.pixelText(
            `${this.rules.score.toString().padStart(7, '0')}\n${t.jobs} ${this.rules.completedJobs.length}/3\n${t.jackpot} ${this.rules.jackpots}/3`,
            W / 2, 211, 13, 0x8be0c2, true,
        )
        stats.style.leading = 8
        const retry = this.pixelText(t.restart, W / 2, 320, 10, 0xf2a33a, true)
        for (const item of [title, stats, retry]) item.label = 'result-overlay'
        this.hudLayer.addChild(overlay, title, stats, retry)
    }

    private clearResultOverlay(): void {
        for (const child of [...this.hudLayer.children]) if (child.label === 'result-overlay') child.destroy()
    }

    setPaused(value: boolean): void {
        this.paused = value
        this.audio.setPaused(value)
    }

    setMuted(value: boolean): void {
        this.audio.setMuted(value)
    }

    setLocale(locale: Locale): void {
        this.locale = locale
        this.localeExplicit = true
        this.updateHud()
    }

    destroy(): void {
        this.destroyed = true
        this.resizeObs?.disconnect()
        this.resizeObs = null
        window.removeEventListener('keydown', this.keyDown)
        window.removeEventListener('keyup', this.keyUp)
        delete (globalThis as Record<string, unknown>).__forceGameOver
        delete (globalThis as Record<string, unknown>).__gameOverUiBoxes
        delete (globalThis as Record<string, unknown>).__gameDesignSize
        this.clearBalls()
        this.app?.destroy(true, { children: true })
        this.app = null
    }

    getDebugState(): Record<string, unknown> {
        return {
            state: this.over ? 'RESULT' : 'GAME',
            over: this.over,
            success: this.success,
            score: this.rules.score,
            ballsRemaining: this.ballsRemaining,
            activeBalls: this.balls.length,
            activeJob: this.rules.activeJob,
            jobs: this.rules.completedJobs.length,
            targets: [...this.rules.targets],
            scoopLit: this.rules.scoopLit,
            lockOpen: this.rules.lockOpen,
            locks: this.rules.locks,
            multiball: this.rules.multiball,
            jackpots: this.rules.jackpots,
            superLit: this.rules.superLit,
            leftFlipper: Boolean(this.leftFlipper?.active),
            rightFlipper: Boolean(this.rightFlipper?.active),
            plungerPower: Math.round(this.plungerPower * 100),
            waitingForLaunch: this.balls.some((ball) => ball.waiting),
            objective: this.currentObjective(),
            paused: this.paused,
        }
    }
}
