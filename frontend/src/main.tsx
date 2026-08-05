import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ToastContainer } from '@/components/ui/Toast'
import { UpdateBanner } from '@/components/ui/UpdateBanner'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} signInFallbackRedirectUrl="/">
      <QueryClientProvider client={queryClient}>
        <App />
        <ToastContainer />
        <UpdateBanner />
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>,
)
