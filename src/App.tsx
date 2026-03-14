import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { AuthProvider } from './auth/AuthProvider'
import { SyncProvider } from './sync/SyncProvider'

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <RouterProvider router={router} />
      </SyncProvider>
    </AuthProvider>
  )
}
