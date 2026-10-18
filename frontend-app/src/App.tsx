import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import { PublicLayout } from "./components/PublicLayout";
import { StaffShell } from "./components/StaffShell";
import { Welcome } from "./pages/Welcome";
import { HomePage } from "./pages/HomePage";
import { Register } from "./pages/Register";
import { Menu } from "./pages/Menu";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Kds } from "./pages/Kds";
import { Pos } from "./pages/Pos";
import { OrderGrace } from "./pages/OrderGrace";
import { OrderCheckout } from "./pages/OrderCheckout";
import { OrderTracking } from "./pages/OrderTracking";
import { OrderSuccess } from "./pages/OrderSuccess";
import { StaffLogin } from "./pages/StaffLogin";
import { Admin } from "./pages/Admin";
import { StaffTables } from "./pages/StaffTables";
import { Account } from "./pages/Account";
import { StorePage } from "./pages/StorePage";
import { VnpayReturn } from "./pages/VnpayReturn";
import { InventoryCheck } from "./pages/InventoryCheck";
import { IngredientFormula } from "./pages/IngredientFormula";
import { WorkSchedule } from "./pages/WorkSchedule";
import { AdminSchedule } from "./pages/AdminSchedule";
import { StaffChat } from "./pages/StaffChat";
import { StaffOrderStatus } from "./pages/StaffOrderStatus";
import { QrGenerator } from "./pages/QrGenerator";
import { Attendance } from "./pages/Attendance";
import { StaffPayslips } from "./pages/StaffPayslips";
import { Promotions } from "./pages/Promotions";
import { Blog } from "./pages/Blog";
import { BlogDetail } from "./pages/BlogDetail";
import { ShipperDashboard } from "./pages/ShipperDashboard";
import { HrRequests } from "./pages/HrRequests";
import { getStaffInfo } from "./lib/staffApi";
import { SupplierPortal } from "./pages/SupplierPortal";
import { ProcurementAdmin } from "./pages/ProcurementAdmin";

function StaffRoute({
  allow,
  element,
}: {
  allow: string[];
  element: ReactElement;
}) {
  const info = getStaffInfo();
  if (!info || !allow.includes(info.role)) return <Navigate to="/staff/login" replace />;
  return element;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Welcome />} />
          <Route path="/register" element={<Register />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/account" element={<Account />} />
          <Route path="/about" element={<StorePage />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:id" element={<BlogDetail />} />
          <Route path="/order/:id/grace" element={<OrderGrace />} />
          <Route path="/order/:id/checkout" element={<OrderCheckout />} />
          <Route path="/order/:id/tracking" element={<OrderTracking />} />
          <Route path="/order/:id/success" element={<OrderSuccess />} />
          <Route path="/vnpay-return" element={<VnpayReturn />} />
        </Route>

        <Route path="/welcome" element={<Navigate to="/login" replace />} />

        {/* SUPPLIER PORTAL (Standalone) */}
        <Route path="/supplier" element={<SupplierPortal />} />

        <Route element={<StaffShell />}>
          <Route path="/pos" element={<Pos />} />
          <Route path="/staff/tables" element={<StaffTables />} />
          <Route path="/kds" element={<Kds />} />
          <Route path="/staff/inventory" element={<InventoryCheck />} />
          <Route path="/staff/schedule" element={<WorkSchedule />} />
          <Route path="/staff/chat" element={<StaffChat />} />
          <Route path="/staff/order-status" element={<StaffOrderStatus />} />
          <Route path="/staff/order-status" element={<StaffOrderStatus />} />
          <Route path="/staff/attendance" element={<Attendance />} />
          <Route path="/staff/payslips" element={<StaffPayslips />} />
          <Route path="/staff/requests" element={<HrRequests />} />
          <Route path="/staff/shipper" element={<ShipperDashboard />} />
        </Route>

        <Route path="/admin" element={<StaffRoute allow={["Admin"]} element={<Admin />} />} />
        <Route path="/admin/formulas" element={<StaffRoute allow={["Admin"]} element={<IngredientFormula />} />} />
        <Route path="/admin/procurement" element={<StaffRoute allow={["Admin", "Purchasing", "Manager"]} element={<ProcurementAdmin />} />} />
        <Route path="/admin/schedule" element={<StaffRoute allow={["Admin", "Cashier", "Kitchen", "Waiter", "Shipper"]} element={<AdminSchedule />} />} />
        <Route path="/admin/qr" element={<StaffRoute allow={["Admin"]} element={<QrGenerator />} />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
