import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameResult } from '../game/types'
import { MoonmailGame } from '../game/MoonmailGame'

interface Props {
    onGameOver(result: GameResult): void
    onExit(): void
    muted?: boolean
}

/**
 * Mounts the game runtime and forwards its lifecycle to the shell.
 * Swap `new SampleGame()` for the real game's runtime — nothing else in the
 * shell needs to change as long as it implements GameRuntime.
 */
export default function GameScreen({ onGameOver, onExit, muted = false }: Props) {
    const { t } = useTranslation()
    const hostRef = useRef<HTMLDivElement>(null)
    const endedRef = useRef(false)

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const game = new MoonmailGame()
        game.setMuted(muted)
        game.mount(host, {
            onGameOver: (result) => {
                if (endedRef.current) return
                endedRef.current = true
                // Let the runtime's game-over presentation breathe briefly.
                setTimeout(() => onGameOver(result), 900)
            },
        })

        // Expose runtime state for scripts/smoke.mjs and agent debugging.
        const poll = setInterval(() => {
            ;(globalThis as unknown as Record<string, unknown>).__gameState = game.getDebugState()
        }, 250)
        const onVisibility = () => game.setPaused(document.hidden)
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            clearInterval(poll)
            document.removeEventListener('visibilitychange', onVisibility)
            game.destroy()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [muted, onGameOver])

    return (
        <div className="screen game-screen">
            <div ref={hostRef} className="game-host" />
            <button className="btn game-exit-btn" onClick={onExit}>
                {t('game.exit')}
            </button>
        </div>
    )
}
