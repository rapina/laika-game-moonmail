import { useTranslation } from 'react-i18next'
import titleArt from '../../public/art/moonmail-title.png'
import { getLocale, setLocale } from '../i18n'

interface Props {
    muted: boolean
    onToggleMute(): void
    onPlay(): void
}

export default function TitleScreen({ muted, onToggleMute, onPlay }: Props) {
    const { t } = useTranslation()
    const locale = getLocale() === 'en' ? 'en' : 'ko'
    return (
        <div className="screen moon-title" data-state="TITLE">
            <img className="title-art" src={titleArt} alt="" draggable={false} />
            <div className="title-vignette" />
            <div className="moon-title-content">
                <div className="shift-chip">{t('title.shift')}</div>
                <h1><span>MOONMAIL</span><small>LAST SHIFT</small></h1>
                <p>{t('title.tagline')}</p>
                <div className="goal-card">
                    <b>{t('title.goal')}</b>
                    <span>{t('title.controls')}</span>
                </div>
                <button className="pixel-button primary title-play" onClick={onPlay}>
                    {t('title.play')}
                </button>
                <div className="title-tools">
                    <button className="pixel-button compact" data-action="lang" onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}>
                        {locale === 'ko' ? 'EN' : '한국어'}
                    </button>
                    <button className="pixel-button compact" onClick={onToggleMute}>
                        {muted ? t('title.soundOff') : t('title.soundOn')}
                    </button>
                </div>
            </div>
            <div className="title-version">v{__APP_VERSION__}</div>
        </div>
    )
}
