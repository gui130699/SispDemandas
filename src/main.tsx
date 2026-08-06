import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`))
window.addEventListener('sisp-apply-update', () => window.location.reload())
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
