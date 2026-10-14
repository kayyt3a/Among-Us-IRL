import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import { GameProvider } from './state/GameProvider.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { installAudioUnlock } from './audio/proximity'
import { initMonitoring } from './monitoring'

initMonitoring()
installAudioUnlock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <GameProvider>
        <App />
      </GameProvider>
    </ErrorBoundary>
  </StrictMode>,
)
