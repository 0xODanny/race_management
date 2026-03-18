import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import { AppLayout } from './layouts/AppLayout'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireRole } from '../auth/RequireRole'

import { HomePage } from '../pages/public/HomePage'
import { HowItWorksPage } from '../pages/public/HowItWorksPage'
import { EventPage } from '../pages/public/EventPage'
import { OfflineMapPage } from '../pages/public/OfflineMapPage'
import { LiveResultsPage } from '../pages/public/LiveResultsPage'
import { ProjectorBoardPage } from '../pages/public/ProjectorBoardPage'
import { RegisterPage } from '../pages/public/RegisterPage'

import { AthleteDashboardPage } from '../pages/athlete/AthleteDashboardPage'
import { CourseInfoPage } from '../pages/athlete/CourseInfoPage'
import { AthleteResultsPage } from '../pages/athlete/AthleteResultsPage'
import { RaceModePage } from '../pages/athlete/RaceModePage'
import { RaceMapPage } from '../pages/athlete/RaceMapPage'

import { CheckInPage } from '../pages/staff/CheckInPage'
import { AdminHomePage } from '../pages/admin/AdminHomePage'
import { MapEditorPage } from '../pages/admin/MapEditorPage.tsx'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/how', element: <HowItWorksPage /> },
      { path: '/events/:eventId', element: <EventPage /> },
      { path: '/events/:eventId/map', element: <OfflineMapPage /> },
      { path: '/events/:eventId/register', element: <RegisterPage /> },
      { path: '/events/:eventId/results', element: <LiveResultsPage /> },
      { path: '/events/:eventId/projector', element: <ProjectorBoardPage /> },
      { path: '/login', element: <Navigate to="/" replace /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/athlete', element: <AthleteDashboardPage /> },
          { path: '/athlete/course', element: <CourseInfoPage /> },
          { path: '/athlete/results', element: <AthleteResultsPage /> },
          { path: '/race', element: <RaceModePage /> },
          { path: '/race/map', element: <RaceMapPage /> },
        ],
      },
      {
        element: <RequireRole allow={['staff', 'admin']} />,
        children: [{ path: '/staff/checkin/:eventId', element: <CheckInPage /> }],
      },
      {
        element: <RequireRole allow={['admin']} />,
        children: [
          { path: '/admin', element: <AdminHomePage /> },
          { path: '/admin/map-editor', element: <MapEditorPage /> },
          { path: '/admin/map-editor/:eventId', element: <MapEditorPage /> },
        ],
      },
    ],
  },
])
