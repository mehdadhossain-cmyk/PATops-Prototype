import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Layout } from './components/Layout'
import { canManageStudents, canManageTraining, canViewStaff } from './data/logic'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ModulePage } from './pages/ModulePage'
import { MyTrainingPage } from './pages/MyTrainingPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { StaffDetailPage } from './pages/StaffDetailPage'
import { StaffPage } from './pages/StaffPage'
import { TrainingAdminPage } from './pages/TrainingAdminPage'
import { TrainingTrackerPage } from './pages/TrainingTrackerPage'
import { CallLogPage } from './pages/CallLogPage'
import { WellbeingPage } from './pages/WellbeingPage'
import { AtRiskPage } from './pages/AtRiskPage'
import { AttendancePage } from './pages/AttendancePage'
import { GroupDetailPage } from './pages/GroupDetailPage'
import { GroupsPage } from './pages/GroupsPage'
import { ImportPage } from './pages/ImportPage'
import { IntakesPage } from './pages/IntakesPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { StudentsPage } from './pages/StudentsPage'
import { DbProvider, useDb } from './store/db'

/** Remount the module page per module so quiz state resets between modules. */
function KeyedModulePage() {
  const { moduleId } = useParams()
  return <ModulePage key={moduleId} />
}

function AppRoutes() {
  const { me } = useDb()
  if (!me) return <LoginPage />
  // Invited users are sent straight to profile setup on first sign-in.
  const firstRun = me.status === 'invited'
  const staff = canViewStaff(me.role)
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={firstRun ? <Navigate to="/profile" replace /> : <DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="training" element={<MyTrainingPage />} />
        <Route path="training/:moduleId" element={<KeyedModulePage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:id" element={<GroupDetailPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="call-log" element={<CallLogPage />} />
        <Route path="wellbeing" element={<WellbeingPage />} />
        <Route path="at-risk" element={<AtRiskPage />} />
        {canManageStudents(me.role) && <Route path="attendance" element={<AttendancePage />} />}
        <Route path="students/:id" element={<StudentDetailPage />} />
        {staff && <Route path="intakes" element={<IntakesPage />} />}
        {canManageStudents(me.role) && <Route path="import" element={<ImportPage />} />}
        {staff && <Route path="staff" element={<StaffPage />} />}
        {staff && <Route path="staff/:id" element={<StaffDetailPage />} />}
        {staff && <Route path="staff/:id/edit" element={<ProfilePage />} />}
        {staff && <Route path="training-tracker" element={<TrainingTrackerPage />} />}
        {canManageTraining(me.role) && <Route path="training-admin" element={<TrainingAdminPage />} />}
        {canManageTraining(me.role) && <Route path="settings" element={<SettingsPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <DbProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </DbProvider>
  )
}
