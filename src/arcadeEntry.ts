// 아케이드 포털은 'unsafe-eval' 없는 CSP로 서빙된다. PixiJS는 셰이더 프로그램을
// eval 없이 만들기 위해 이 모듈이 필요하다. 이것이 없으면 포털에서만 부팅이 실패하고
// 로컬 단독 실행은 CSP가 없어 멀쩡하므로, 게임 쪽 검증이 전부 초록인 채로 공개된다.
// maejil·violet·grainsplit·repose에서 네 번 되풀이된 뒤 템플릿으로 올렸다.
import 'pixi.js/unsafe-eval'
import { MoonmailGame } from './game/MoonmailGame'
import { STORAGE_PREFIX } from './appConfig'
import './index.css'

/**
 * Arcade embed entry (contract-v1). Swap `new SampleGame()` for the real
 * game runtime — `scripts/new-game.js` rewrites STORAGE_PREFIX to the game
 * slug, which doubles as the bridge gameId.
 *
 * The runner iframe is sandboxed without allow-same-origin: never touch
 * localStorage outside a try/catch on this code path.
 */
type Locale = 'ko' | 'en'
type HostEvent = 'ready' | 'started' | 'ended'
interface Options {
    root: HTMLElement
    assetBaseUrl: string
    locale?: Locale
    seed?: string
    host: { emit(event: { contractVersion: 1; gameId: string; sequence: number; type: HostEvent; payload?: Record<string, unknown> }): void }
}

export function mountGame(options: Options) {
    let sequence = 0
    let run = 1
    let destroyed = false
    const emit = (type: HostEvent, payload?: Record<string, unknown>) => options.host.emit({
        contractVersion: 1,
        gameId: STORAGE_PREFIX,
        sequence: ++sequence,
        type,
        ...(payload ? { payload } : {}),
    })
    const shell = document.createElement('div')
    shell.className = 'screen game-screen'
    const host = document.createElement('div')
    host.className = 'game-host'
    shell.appendChild(host)
    options.root.appendChild(shell)
    const runtimeAssetBase = options.assetBaseUrl === '/' ? new URL('./', import.meta.url).href : options.assetBaseUrl
    const game = new MoonmailGame(runtimeAssetBase)
    game.setLocale(options.locale === 'en' ? 'en' : 'ko')
    void game.mount(host, {
        onGameOver: (result) => emit('ended', { runId: String(run), result }),
    }).then(() => {
        if (destroyed) return
        // The host owns the locale in the arcade — hide any in-game switcher.
        host.querySelector<HTMLElement>('[data-action="lang"]')?.setAttribute('hidden', '')
        emit('ready')
        emit('started', { runId: String(run) })
    })
    const debugPoll = window.setInterval(() => {
        ;(globalThis as unknown as Record<string, unknown>).__gameState = game.getDebugState()
    }, 100)
    return {
        pause() { (game as { setPaused?(v: boolean): void }).setPaused?.(true) },
        resume() { (game as { setPaused?(v: boolean): void }).setPaused?.(false) },
        mute(value: boolean) { (game as { setMuted?(v: boolean): void }).setMuted?.(value) },
        setLocale(locale: Locale) { (game as { setLocale?(l: Locale): void }).setLocale?.(locale) },
        restart() { run += 1; (game as { restartRun?(): void }).restartRun?.(); emit('started', { runId: String(run) }) },
        destroy() { destroyed = true; clearInterval(debugPoll); game.destroy(); shell.remove() },
    }
}
