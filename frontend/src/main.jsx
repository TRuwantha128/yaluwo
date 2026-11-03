import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'lenis/dist/lenis.css'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './theme/ThemeProvider'
import MapsProvider from './maps/MapsProvider'
import { AuthProvider } from './auth/AuthProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MapsProvider>
            <App />
          </MapsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
