import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { LoginPage } from './pages/LoginPage'
import { NewTrainingPage } from './pages/NewTrainingPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { SeatsPage } from './pages/SeatsPage'
import { TrainingDetailPage } from './pages/TrainingDetailPage'
import { TrainingsPage } from './pages/TrainingsPage'

// A route array like vue-router's `routes`. Child routes render inside the parent's <Outlet />.
// Exported on its own so tests can mount it in a memory router (see test/render.tsx).
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    // Every page except /login needs a logged-in user.
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/trainings" replace /> },
      { path: 'trainings', element: <TrainingsPage /> },
      { path: 'trainings/:id', element: <TrainingDetailPage /> },
      { path: 'seats', element: <SeatsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      { path: 'admin/trainings/new', element: <NewTrainingPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

// On GitHub Pages the app lives under /<repo>/. Vite's `base` sets BASE_URL, and the router strips it.
export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
