import { useTranslation } from 'react-i18next'
import titleArt from '../../public/art/moonmail-title.png'

export default function IntroScreen({ onContinue }: { onContinue(): void }) {
    const { t } = useTranslation()
    return (
        <div className="screen story-screen" data-state="INTRO">
            <img className="story-art" src={titleArt} alt="" draggable={false} />
            <div className="story-shade" />
            <div className="story-copy">
                <div className="story-kicker">{t('intro.kicker')}</div>
                <p>{t('intro.line1')}</p>
                <p>{t('intro.line2')}</p>
                <button className="pixel-button primary" onClick={onContinue}>
                    {t('intro.continue')}
                </button>
            </div>
        </div>
    )
}
