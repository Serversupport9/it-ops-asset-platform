import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AddEmployee from "./pages/AddEmployee";
import Approvals from "./pages/Approvals";
import Assets from "./pages/Assets";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import Fulfillment from "./pages/Fulfillment";
import Login from "./pages/Login";
import MyAssets from "./pages/MyAssets";
import MyRequests from "./pages/MyRequests";
import RequestNew from "./pages/RequestNew";
import ResetPassword from "./pages/ResetPassword";
import ReturnNew from "./pages/ReturnNew";
import Roles from "./pages/Roles";
import { getRole, isAuthenticated } from "./services/auth";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const role = getRole();
  return role && roles.includes(role) ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/confirm" element={<ResetPassword />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/assets/mine" element={<MyAssets />} />
          <Route path="/requests/new" element={<RequestNew />} />
          <Route path="/requests/mine" element={<MyRequests />} />
          <Route path="/returns/new" element={<ReturnNew />} />
          <Route
            path="/approvals"
            element={
              <RoleRoute roles={["it", "management", "super_admin"]}>
                <Approvals />
              </RoleRoute>
            }
          />
          <Route
            path="/fulfillment"
            element={
              <RoleRoute roles={["it", "management", "super_admin"]}>
                <Fulfillment />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/add-employee"
            element={
              <RoleRoute roles={["it", "management", "super_admin"]}>
                <AddEmployee />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/assets"
            element={
              <RoleRoute roles={["it", "management", "super_admin"]}>
                <Assets />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <RoleRoute roles={["it", "management", "super_admin"]}>
                <Roles />
              </RoleRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
