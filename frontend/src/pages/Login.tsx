import { Navigate } from 'react-router-dom'
import { SignIn, useAuth } from '@clerk/clerk-react'
import { BrandMark, useBrand } from '@/lib/brand'

export default function Login() {
  const { isSignedIn } = useAuth()
  const brand = useBrand()

  if (isSignedIn) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Top bar */}
      <header className="h-14 flex items-center px-6 border-b border-gray-200 bg-white">
        <BrandMark className="h-7 w-auto" />
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-6">

          {/* Logo card */}
          <div className="text-center">
            {brand.logoUrl && (
              <div className="w-14 h-14 bg-accent-light rounded-2xl flex items-center justify-center mx-auto mb-3">
                <img src={brand.logoUrl} alt="" className="h-8 w-auto" />
              </div>
            )}
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Sign in to {brand.brandName}</h1>
            <p className="text-sm text-gray-400 mt-1">Distribution intelligence for your team</p>
          </div>

          {/* Clerk handles the actual sign-in form */}
          <SignIn
            routing="hash"
            fallbackRedirectUrl="/"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'shadow-sm border border-gray-200 rounded-2xl',
                headerTitle: 'hidden',
                headerSubtitle: 'hidden',
                socialButtonsBlockButton: 'border border-gray-200 rounded-lg',
                formButtonPrimary: 'bg-accent hover:bg-accent-hover rounded-lg text-sm font-semibold',
                footerActionLink: 'text-accent hover:text-accent-hover',
                footerAction: 'hidden',
              },
            }}
          />

          <p className="text-xs text-gray-400">
            Powered by <span className="font-medium text-gray-500">Parclo</span> · Retail Execution Intelligence
          </p>
        </div>
      </div>
    </div>
  )
}
