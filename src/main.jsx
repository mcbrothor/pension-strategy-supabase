import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.jsx'
import { MarketProvider } from './context/MarketContext.jsx'
import { PortfolioProvider } from './context/PortfolioContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <MarketProvider>
        <PortfolioProvider>
          <App />
        </PortfolioProvider>
      </MarketProvider>
    </AuthProvider>
  </React.StrictMode>,
)
