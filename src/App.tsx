import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { AuthProvider } from './auth/AuthProvider'
import { SyncProvider } from './sync/SyncProvider'
import { I18nProvider } from './i18n/i18n'

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <SyncProvider>
          <RouterProvider router={router} />
        </SyncProvider>
      </AuthProvider>
    </I18nProvider>
  )
}
