/**
 * main.jsx — Application Entry Point
 *
 * This is the first file Vite executes when the app starts.
 * It mounts the React component tree into the <div id="root"> in index.html.
 *
 * Provider hierarchy (outermost → innermost):
 *   StrictMode        — Enables React development warnings and double-render checks
 *   BrowserRouter     — Enables client-side URL routing via react-router-dom
 *   PersonnelProvider — Starts the Socket.IO connection once and shares live
 *                       GPS / personnel state with every page and component
 *   App               — Root component that renders the full route tree
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'               // Global CSS resets, base font, and body layout
import './styles/feedback.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { FeedbackProvider } from './context/FeedbackContext.jsx'
import { PersonnelProvider } from './context/PersonnelContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/*
        PersonnelProvider runs the usePersonnelRealtime hook once at the very
        top of the tree so ALL pages share one Socket.IO connection and one
        copy of the personnel state — no duplicate connections or data.
      */}
      <FeedbackProvider>
        <AuthProvider>
          <PersonnelProvider>
            <App />
          </PersonnelProvider>
        </AuthProvider>
      </FeedbackProvider>
    </BrowserRouter>
  </StrictMode>,
)
