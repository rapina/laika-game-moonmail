/**
 * Smoke test — boots the dev server, runs the game headlessly and reports
 * whether the deployable page boots without runtime errors. Sequence 22
 * retains its historical pointer-response check; games through sequence 21
 * retain the historical full-run contract.
 *
 *   node scripts/smoke.mjs [seed] [timeoutMs]
 *
 * What it does:
 *   1. starts `npm run dev` on port 4173
 *   2. opens /autoplay.html?seed=<seed> (GameScreen only, seeded RNG)
 *   3. clicks around the canvas until globalThis.__gameState.over is true
 *   4. saves a screenshot to smoke.png, prints a JSON summary
 *
 * Exit code 0 = game mounted, finished a run, zero page/console errors.
 * Designed to be run by coding agents after every gameplay change.
 * Requires a local Chrome install (or set CHROME=<path to chrome.exe>).
 */
import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

// 검증 증거를 코드 상태에 바인딩한다: 잠금 게이트(prepare-editorial.mjs)가
// 같은 방식으로 해시를 재계산해 소스가 바뀐 뒤의 낡은 증거를 거부한다.
// 서사 소유 자산: 잠금 계약에서 라이카 서사 단계만 추가·수정할 수 있는 경로.
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { sourceHash } from './source-hash.mjs'

// 4173은 아케이드 로컬 서버(arcade/scripts/serve.mjs)가 쓴다. 포트가 겹치면
// 게이트 스모크가 남의 서버에 붙어 위양성으로 실패한다.
const DEV_PORT = 4183
const SEED = process.argv[2] || '1'
const TIMEOUT_MS = Number(process.argv[3] || '90000')
const URL = `http://127.0.0.1:${DEV_PORT}/autoplay.html?seed=${encodeURIComponent(SEED)}`
const studio = existsSync('.studio.json') ? JSON.parse(readFileSync('.studio.json', 'utf8')) : {}
const deploymentOnly = process.env.SMOKE_MODE === 'deployment-only'
  || (Number.isInteger(studio.sequence) && studio.sequence >= 23)
const fatalOnly = process.env.SMOKE_MODE === 'fatal-only'
  || (Number.isInteger(studio.sequence) && studio.sequence === 22)

async function killProcessTree(proc) {
    if (!proc?.pid) return
    if (process.platform === 'win32') {
        await new Promise((resolve) => {
            const killer = spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore', shell: true })
            killer.on('exit', resolve)
            killer.on('error', resolve)
        })
        return
    }
    // `dev` is spawned detached, so it leads its own process group. Signal the
    // whole group (negative pid) — a bare proc.kill only hits the `sh -c`
    // wrapper and leaves vite/esbuild alive, whose open stdio pipes keep this
    // process from ever exiting (the CI hang this script used to cause).
    try {
        process.kill(-proc.pid, 'SIGKILL')
    } catch {
        try { proc.kill('SIGKILL') } catch { /* already gone */ }
    }
}

async function waitForServer() {
    const started = Date.now()
    while (Date.now() - started < 60000) {
        try {
            const r = await fetch(`http://127.0.0.1:${DEV_PORT}/`)
            if (r.ok) return
        } catch { /* not up yet */ }
        await delay(500)
    }
    throw new Error('dev server did not start in time')
}

async function launchBrowser() {
    const opts = { headless: true, args: ['--disable-gpu', '--no-sandbox'] }
    if (process.env.CHROME) {
        return chromium.launch({ ...opts, executablePath: process.env.CHROME })
    }
    try {
        return await chromium.launch({ ...opts, channel: 'chrome' })
    } catch {
        return chromium.launch({
            ...opts,
            executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        })
    }
}

async function main() {
    const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(DEV_PORT), '--force'], {
        cwd: process.cwd(),
        stdio: 'pipe',
        shell: true,
        // Own process group so killProcessTree can take down vite + its
        // children in one signal (see killProcessTree). No effect on Windows.
        detached: process.platform !== 'win32',
    })
    let devLog = ''
    dev.stdout.on('data', (b) => { devLog += String(b) })
    dev.stderr.on('data', (b) => { devLog += String(b) })

    const consoleErrors = []
    const pageErrors = []

    try {
        await waitForServer()
        const browser = await launchBrowser()
        const page = await browser.newPage({ viewport: { width: 450, height: 800 } })
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text())
        })
        page.on('pageerror', (err) => pageErrors.push(String(err)))

        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
        if (deploymentOnly) {
            await page.waitForSelector('body', { timeout: 30000 })
            await delay(1500)
            const screenshot = await page.screenshot().catch(() => null)
            await browser.close()
            const summary = {
                seed: SEED,
                sourceHash: sourceHash(),
                mounted: true,
                consoleErrors,
                pageErrors,
            }
            const serialized = JSON.stringify(summary, null, 2)
            const existing = existsSync('smoke-result.json')
                ? readFileSync('smoke-result.json', 'utf-8').trim()
                : null
            if (existing !== serialized) {
                writeFileSync('smoke-result.json', serialized, 'utf-8')
                if (screenshot) writeFileSync('smoke.png', screenshot)
            }
            console.log(serialized)
            if (pageErrors.length > 0 || consoleErrors.length > 0) {
                console.error('FAIL: page/console errors while loading the deployable page')
                return 1
            }
            console.log('SMOKE OK (deployment-only)')
            return 0
        }
        await page.waitForSelector('canvas', { timeout: 30000 })

        // Blind-click around the canvas until the run ends. Games with menus /
        // multi-step input may need a smarter driver — extend here per game.
        const started = Date.now()
        let state = null
        let interactionVerified = false
        while (Date.now() - started < TIMEOUT_MS) {
            const box = await page.locator('canvas').boundingBox().catch(() => null)
            if (box) {
                const beforeState = await page.evaluate(() => globalThis.__gameState ?? null)
                const beforeImage = await page.locator('canvas').screenshot().catch(() => null)
                if (beforeState?.waitingForLaunch) {
                    // Moonmail's visible launch control is a drag-release plunger.
                    // Exercise that real gesture instead of waiting for a blind click
                    // to land in its narrow shooter lane by chance.
                    const x = box.x + box.width * 0.91
                    const y0 = box.y + box.height * 0.79
                    const y1 = box.y + box.height * 0.91
                    await page.mouse.move(x, y0)
                    await page.mouse.down()
                    await page.mouse.move(x, y1, { steps: 4 })
                    await page.mouse.up()
                } else {
                    const x = box.x + box.width * (0.1 + Math.random() * 0.8)
                    const y = box.y + box.height * (0.68 + Math.random() * 0.22)
                    await page.mouse.click(x, y).catch(() => {})
                }
                await delay(180)
                const afterState = await page.evaluate(() => globalThis.__gameState ?? null)
                const afterImage = await page.locator('canvas').screenshot().catch(() => null)
                interactionVerified ||= JSON.stringify(beforeState) !== JSON.stringify(afterState)
                  || (beforeImage && afterImage && !beforeImage.equals(afterImage))
            }
            state = await page.evaluate(() => globalThis.__gameState ?? null)
            if (state?.over || (fatalOnly && interactionVerified)) break
            await delay(150)
        }
        // GameScreen defers onGameOver briefly for the runtime's game-over
        // presentation — wait it out so __gameResult is populated.
        await delay(1500)
        let result = await page.evaluate(() => globalThis.__gameResult ?? null)
        const screenshot = await page.screenshot().catch(() => null)

        // 게임 오버 화면은 화면 탭만으로 결과를 전달하고 새 판을 시작할 수
        // 있어야 한다. 그려진 버튼이 아니라 실제 동작을 검증한다.
        let restartVerified = false
        if (state?.over) {
            const box = await page.locator('canvas').boundingBox().catch(() => null)
            if (box) {
                for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.8], [0.5, 0.92], [0.5, 0.5], [0.5, 0.8], [0.5, 0.92]]) {
                    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy).catch(() => {})
                    await delay(900)
                    result = result ?? await page.evaluate(() => globalThis.__gameResult ?? null)
                    const current = await page.evaluate(() => globalThis.__gameState ?? null)
                    if (result && current && current.over !== true) { restartVerified = true; break }
                }
            }
        }
        await browser.close()

        const summary = {
            seed: SEED,
            sourceHash: sourceHash(),
            mounted: state !== null,
            interactionVerified,
            finished: Boolean(state?.over),
            resultDelivered: Boolean(result),
            restartVerified,
            consoleErrors,
            pageErrors,
        }
        // 증거 파일은 안정 필드만 담는다. 블라인드 드라이버는 실제 벽시계 타이밍으로
        // 입력하므로 점수·최종 상태 같은 세부는 실행마다 달라진다. 게시 게이트
        // (publish-game.mjs)는 gate 재실행 뒤 저장소가 더러워지면 중단하므로,
        // 통과 여부가 같으면 증거를 다시 쓰지 않는다.
        const serialized = JSON.stringify(summary, null, 2)
        const existing = existsSync('smoke-result.json')
            ? readFileSync('smoke-result.json', 'utf-8').trim()
            : null
        if (existing !== serialized) {
            writeFileSync('smoke-result.json', serialized, 'utf-8')
            if (screenshot) writeFileSync('smoke.png', screenshot)
        }
        console.log(serialized)

        if (!summary.mounted) {
            console.error('FAIL: game never exposed __gameState (mount failed?)')
            console.error(devLog.split(/\r?\n/).slice(-30).join('\n'))
            return 1
        }
        if (pageErrors.length > 0 || consoleErrors.length > 0) {
            console.error('FAIL: page/console errors during the run')
            return 1
        }
        if (fatalOnly && !summary.interactionVerified) {
            console.error('FAIL: pointer input produced no observable response')
            return 1
        }
        if (fatalOnly) {
            console.log('SMOKE OK (fatal-only)')
            return 0
        }
        if (!summary.finished) {
            console.error('FAIL: run did not reach game over within timeout')
            return 1
        }
        if (!summary.resultDelivered) {
            console.error('FAIL: game over did not deliver __gameResult to the host')
            return 1
        }
        if (!summary.restartVerified) {
            console.error('FAIL: tapping the game-over screen did not start a new run')
            return 1
        }
        console.log('SMOKE OK')
        return 0
    } finally {
        await killProcessTree(dev)
    }
}

// Always exit explicitly. The dev server keeps stdio pipes open even after it
// is signalled, so relying on natural event-loop drain would hang the process
// forever (previously stalled CI for ~2h before it was cancelled).
main()
    .then((code) => process.exit(code))
    .catch((e) => {
        console.error(e?.stack || String(e))
        process.exit(1)
    })
