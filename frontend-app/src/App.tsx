import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import { PublicLayout } from "./components/PublicLayout";
import { StaffShell } from "./components/StaffShell";
import { Welcome } from "./pages/Welcome";
import { Register } from "./pages/Register";
import { Menu } from "./pages/Menu";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Kds } from "./pages/Kds";
import { Pos } from "./pages/Pos";
import { OrderGrace } from "./pages/OrderGrace";
import { OrderCheckout } from "./pages/OrderCheckout";
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
import { getStaffInfo } from "./lib/staffApi";

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
          <Route path="/" element={<Welcome />} />
          <Route path="/register" element={<Register />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/account" element={<Account />} />
          <Route path="/about" element={<StorePage />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order/:id/grace" element={<OrderGrace />} />
          <Route path="/order/:id/checkout" element={<OrderCheckout />} />
          <Route path="/order/:id/success" element={<OrderSuccess />} />
          <Route path="/vnpay-return" element={<VnpayReturn />} />
        </Route>

        <Route path="/welcome" element={<Navigate to="/" replace />} />

        <Route element={<StaffShell />}>
          <Route path="/pos" element={<Pos />} />
          <Route path="/staff/tables" element={<StaffTables />} />
          <Route path="/kds" element={<Kds />} />
          <Route path="/staff/inventory" element={<InventoryCheck />} />
          <Route path="/staff/schedule" element={<WorkSchedule />} />
          <Route path="/staff/chat" element={<StaffChat />} />
          <Route path="/staff/order-status" element={<StaffOrderStatus />} />
          <Route path="/staff/attendance" element={<Attendance />} />
        </Route>

        <Route path="/admin" element={<StaffRoute allow={["Admin"]} element={<Admin />} />} />
        <Route path="/admin/formulas" element={<StaffRoute allow={["Admin"]} element={<IngredientFormula />} />} />
        <Route path="/admin/schedule" element={<StaffRoute allow={["Admin", "Cashier", "Kitchen", "Waiter"]} element={<AdminSchedule />} />} />
        <Route path="/admin/qr" element={<StaffRoute allow={["Admin"]} element={<QrGenerator />} />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
