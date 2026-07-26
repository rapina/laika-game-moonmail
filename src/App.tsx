import { useEffect, useState } from 'react'
import MobileFrame from './components/MobileFrame'
import GameScreen from './components/GameScreen'
import IntroScreen from './screens/IntroScreen'
import ResultScreen from './screens/ResultScreen'
import TitleScreen from './screens/TitleScreen'
import type { GameResult } from './game/types'

type Screen = 'INTRO' | 'TITLE' | 'GAME' | 'RESULT'

export default function App() {
    const [screen, setScreen] = useState<Screen>('INTRO')
    const [muted, setMuted] = useState(false)
    const [result, setResult] = useState<GameResult | null>(null)
    const [run, setRun] = useState(1)

    useEffect(() => {
        ;(globalThis as unknown as Record<string, unknown>).__appState = screen
    }, [screen])

    const startGame = () => {
        setResult(null)
        setRun((value) => value + 1)
        setScreen('GAME')
    }

    return (
        <MobileFrame>
            {screen === 'INTRO' && <IntroScreen onContinue={() => setScreen('TITLE')} />}
            {screen === 'TITLE' && (
                <TitleScreen
                    muted={muted}
                    onToggleMute={() => setMuted((value) => !value)}
                    onPlay={startGame}
                />
            )}
            {screen === 'GAME' && (
                <GameScreen
                    key={run}
                    muted={muted}
                    onGameOver={(nextResult) => {
                        setResult(nextResult)
                        setScreen('RESULT')
                    }}
                    onExit={() => setScreen('TITLE')}
                />
            )}
            {screen === 'RESULT' && result && (
                <ResultScreen
                    result={result}
                    onRetry={startGame}
                    onMenu={() => setScreen('TITLE')}
                />
            )}
        </MobileFrame>
    )
}
