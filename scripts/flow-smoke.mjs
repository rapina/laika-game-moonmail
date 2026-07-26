import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { sourceHash } from './source-hash.mjs'

const PORT = 4191
const OUT = 'verification'
const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--force'], {
    stdio: 'pipe', shell: true, detached: process.platform !== 'win32',
})

async function stop() {
    if (!dev.pid) return
    try { process.kill(-dev.pid, 'SIGKILL') } catch { try { dev.kill('SIGKILL') } catch { /* done */ } }
}

async function waitServer() {
    for (let i = 0; i < 120; i++) {
        try { if ((await fetch(`http://127.0.0.1:${PORT}`)).ok) return } catch { /* retry */ }
        await delay(250)
    }
    throw new Error('flow server timeout')
}

async function main() {
    mkdirSync(OUT, { recursive: true })
    await waitServer()
    const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox'] })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'ko-KR' })
    const errors = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'domcontentloaded' })

    const states = []
    await page.waitForSelector('[data-state="INTRO"]')
    states.push(await page.evaluate(() => globalThis.__appState))
    await page.screenshot({ path: `${OUT}/flow-intro.png` })
    await page.locator('[data-state="INTRO"] button').click()
    await page.waitForSelector('[data-state="TITLE"]')
    states.push(await page.evaluate(() => globalThis.__appState))
    await page.screenshot({ path: `${OUT}/flow-title.png` })
    await page.locator('.title-play').click()
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => globalThis.__gameState?.state === 'GAME')
    states.push(await page.evaluate(() => globalThis.__appState))

    // Two independent touch pointer ids must hold both flippers together.
    const bothFlippers = await page.evaluate(async () => {
        const canvas = document.querySelector('canvas')
        const rect = canvas.getBoundingClientRect()
        const fire = (name, pointerId, fx, fy) => canvas.dispatchEvent(new PointerEvent(name, {
            bubbles: true, pointerId, pointerType: 'touch',
            clientX: rect.left + rect.width * fx, clientY: rect.top + rect.height * fy,
        }))
        fire('pointerdown', 31, 0.23, 0.86)
        fire('pointerdown', 32, 0.77, 0.86)
        await new Promise((resolve) => setTimeout(resolve, 350))
        const held = Boolean(globalThis.__gameState?.leftFlipper && globalThis.__gameState?.rightFlipper)
        fire('pointerup', 31, 0.23, 0.86)
        fire('pointerup', 32, 0.77, 0.86)
        return held
    })
    const plunger = await page.evaluate(async () => {
        const canvas = document.querySelector('canvas')
        const rect = canvas.getBoundingClientRect()
        const fire = (name, pointerId, fx, fy) => canvas.dispatchEvent(new PointerEvent(name, {
            bubbles: true, pointerId, pointerType: 'touch',
            clientX: rect.left + rect.width * fx, clientY: rect.top + rect.height * fy,
        }))
        fire('pointerdown', 41, 0.91, 0.79)
        fire('pointermove', 41, 0.91, 0.93)
        await new Promise((resolve) => setTimeout(resolve, 350))
        const power = Number(globalThis.__gameState?.plungerPower ?? 0)
        fire('pointerup', 41, 0.91, 0.93)
        await new Promise((resolve) => setTimeout(resolve, 500))
        return {
            power,
            launched: globalThis.__gameState?.waitingForLaunch === false,
            objectiveVisible: typeof globalThis.__gameState?.objective === 'string'
                && globalThis.__gameState.objective.length > 0,
        }
    })
    await page.screenshot({ path: `${OUT}/flow-game.png` })
    await page.evaluate(() => globalThis.__forceGameOver())
    await page.waitForSelector('[data-state="RESULT"]', { timeout: 5000 })
    states.push(await page.evaluate(() => globalThis.__appState))
    await page.screenshot({ path: `${OUT}/flow-result.png` })
    await page.locator('[data-state="RESULT"] .primary').click()
    await page.waitForSelector('canvas')
    const restart = await page.waitForFunction(() => globalThis.__appState === 'GAME' && globalThis.__gameState?.over === false).then(() => true)
    await browser.close()

    const result = {
        sourceHash: sourceHash(),
        states,
        expectedStates: ['INTRO', 'TITLE', 'GAME', 'RESULT'],
        stateOrder: JSON.stringify(states) === JSON.stringify(['INTRO', 'TITLE', 'GAME', 'RESULT']),
        simultaneousFlippers: bothFlippers,
        plungerReachedFull: plunger.power === 100,
        plungerReleased: plunger.launched,
        objectiveVisible: plunger.objectiveVisible,
        resultRestart: restart,
        errors,
        pass: JSON.stringify(states) === JSON.stringify(['INTRO', 'TITLE', 'GAME', 'RESULT'])
            && bothFlippers && plunger.power === 100 && plunger.launched
            && plunger.objectiveVisible && restart && errors.length === 0,
    }
    writeFileSync(`${OUT}/flow-result.json`, JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
    return result.pass ? 0 : 1
}

main()
    .then(async (code) => { await stop(); process.exit(code) })
    .catch(async (error) => { console.error(error); await stop(); process.exit(1) })
