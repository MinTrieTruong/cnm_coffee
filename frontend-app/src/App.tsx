import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import { Welcome } from "./pages/Welcome";
import { Register } from "./pages/Register";
import { Menu } from "./pages/Menu";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Kds } from "./pages/Kds";
import { Pos } from "./pages/Pos";
import { OrderGrace } from "./pages/OrderGrace";
import { StaffLogin } from "./pages/StaffLogin";
import { Admin } from "./pages/Admin";
import { StaffTables } from "./pages/StaffTables";
import { Account } from "./pages/Account";
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
        <Route path="/" element={<Welcome />} />
        <Route path="/welcome" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Register />} />
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/admin" element={<StaffRoute allow={["Admin"]} element={<Admin />} />} />
        <Route path="/staff/tables" element={<StaffRoute allow={["Waiter", "Admin"]} element={<StaffTables />} />} />
        <Route path="/account" element={<Account />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/order/:id/grace" element={<OrderGrace />} />
        <Route path="/kds" element={<StaffRoute allow={["Kitchen", "Admin"]} element={<Kds />} />} />
        <Route path="/pos" element={<StaffRoute allow={["Cashier", "Admin"]} element={<Pos />} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
