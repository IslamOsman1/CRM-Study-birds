import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Consultancy from './pages/Consultancy.jsx';
import StudentsPage from './pages/StudentsPage.jsx';
import Admissions from './pages/Admissions.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import Reception from './pages/Reception.jsx';
import HR from './pages/HR.jsx';
import Finance from './pages/Finance.jsx';
import ActivityPage from './pages/ActivityPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import { canOpenModule } from './permissions.js';

function Guard({ module, children }) {
  const { user } = useAuth();
  return canOpenModule(user.role, module) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  const homeElement = user.role === 'reception'
    ? <Navigate to="/reception" replace />
    : user.role === 'finance'
      ? <Navigate to="/finance" replace />
      : user.role === 'hr'
        ? <Navigate to="/hr" replace />
      : <Dashboard />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={homeElement} />
        <Route path="consultancy" element={<Guard module="consultancy"><Consultancy /></Guard>} />
        <Route path="students" element={<Guard module="students"><StudentsPage /></Guard>} />
        <Route path="admissions" element={<Guard module="admissions"><Admissions /></Guard>} />
        <Route path="inbox" element={<Guard module="inbox"><InboxPage /></Guard>} />
        <Route path="reports" element={<Guard module="reports"><ReportsPage /></Guard>} />
        <Route path="tasks" element={<Guard module="tasks"><TasksPage /></Guard>} />
        <Route path="reception" element={<Guard module="reception"><Reception /></Guard>} />
        <Route path="hr" element={<Guard module="hr"><HR /></Guard>} />
        <Route path="finance" element={<Guard module="finance"><Finance /></Guard>} />
        <Route path="activity" element={<Guard module="activity"><ActivityPage /></Guard>} />
        <Route path="settings" element={<Guard module="settings"><SettingsPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
