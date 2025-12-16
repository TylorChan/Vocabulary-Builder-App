import {useState, lazy} from 'react'
import TrackCaption from './components/TrackCaption'
// import VoiceAgent from './components/VoiceAgent'
import './App.css'

//** : mean frontend optimization


// ** lazy load VoiceAgent
const VoiceAgent = lazy(() => import('./components/VoiceAgent'));

function App() {
    const [currentInterface, setCurrentInterface] = useState('trackCaption');
    const [isAnimating, setIsAnimating] = useState(false);

    const navigateToVoiceAgent = () => {
        setIsAnimating(true);
        // Wait for fade-out animation to complete before switching
        setTimeout(() => {
            setCurrentInterface('voiceAgent');
            setIsAnimating(false);
        }, 150); // Match CSS animation-duration
    };

    const navigateBack = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentInterface('trackCaption');
            setIsAnimating(false);
        }, 150);
    };

    return (<div>
            {currentInterface === 'trackCaption' ?
                (<div className={`interface-container ${isAnimating ? 'fade-out' : 'fade-in'}`}>
                    <TrackCaption
                        onNavigateToVoiceAgent={navigateToVoiceAgent}/>
                </div>)
                :
                (<div className={`interface-container ${isAnimating ? 'fade-out' : 'fade-in'}`}>
                    <VoiceAgent onNavigateBack={navigateBack}/>
                </div>)}
        </div>)
}

export default App
