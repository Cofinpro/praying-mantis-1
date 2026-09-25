import { createBrowserRouter, Navigate } from 'react-router'
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
export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <Layout />,
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
  ],
  // On GitHub Pages the app lives under /<repo>/. Vite's `base` sets BASE_URL, and the router strips it.
  { basename: import.meta.env.BASE_URL },
)
