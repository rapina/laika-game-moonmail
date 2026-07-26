import { useTranslation } from 'react-i18next'
import titleArt from '../../public/art/moonmail-title.png'
import type { GameResult } from '../game/types'

interface Props {
    result: GameResult
    onRetry(): void
    onMenu(): void
}

export default function ResultScreen({ result, onRetry, onMenu }: Props) {
    const { t } = useTranslation()
    return (
        <div className={`screen result-screen ${result.success ? 'result-success' : ''}`} data-state="RESULT">
            <img className="result-art" src={titleArt} alt="" draggable={false} />
            <div className="result-vignette" />
            <div className="result-panel">
                <div className="result-kicker">{result.success ? t('result.success') : t('result.failed')}</div>
                <div className="result-score">{result.score.toString().padStart(7, '0')}</div>
                <div className="result-grid">
                    <div><span>{t('result.jobs')}</span><b>{result.jobs ?? result.phase}/3</b></div>
                    <div><span>{t('result.jackpots')}</span><b>{result.jackpots ?? 0}/3</b></div>
                </div>
                <p>{result.success ? t('result.successCopy') : t('result.failedCopy')}</p>
                <button className="pixel-button primary" onClick={onRetry}>{t('result.retry')}</button>
                <button className="pixel-button" onClick={onMenu}>{t('result.menu')}</button>
            </div>
        </div>
    )
}
