import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PublicLayout } from "./components/PublicLayout";
import { Welcome } from "./pages/Welcome";
import { HomePage } from "./pages/HomePage";
import { Register } from "./pages/Register";
import { CompletePhone, LinkAccount } from "./pages/SocialComplete";
import { Menu } from "./pages/Menu";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { OrderGrace } from "./pages/OrderGrace";
import { OrderCheckout } from "./pages/OrderCheckout";
import { OrderTracking } from "./pages/OrderTracking";
import { OrderSuccess } from "./pages/OrderSuccess";
import { StaffLogin } from "./pages/StaffLogin";
import { Account } from "./pages/Account";
import { VnpayReturn } from "./pages/VnpayReturn";
import { Promotions } from "./pages/Promotions";
import { Blog } from "./pages/Blog";
import { BlogDetail } from "./pages/BlogDetail";
import { AppShell } from "./components/erp/AppShell";
import { LEGACY_ADMIN_TABS, LEGACY_PATHS } from "./apps/registry";
import { SupplierPortal } from "./pages/SupplierPortal";
import { GamePlay } from "./pages/GamePlay";
import { Policy } from "./pages/Policy";
import { Contact } from "./pages/Contact";
import { useTrackAppHistory } from "./lib/appHistory";

// Trang câu chuyện thương hiệu + cửa hàng: tải lười (Leaflet, nhiều mục ảnh)
const About = lazy(() => import("./pages/About").then((m) => ({ default: m.About })));
const Stores = lazy(() => import("./pages/Stores").then((m) => ({ default: m.Stores })));
const StoreDetail = lazy(() => import("./pages/Stores").then((m) => ({ default: m.StoreDetail })));
const page = (el: React.ReactNode) => <Suspense fallback={<div className="c-wrap c-sec" aria-busy="true" />}>{el}</Suspense>;

function HistoryTracker() {
  useTrackAppHistory();
  return null;
}

/** /admin?tab=… (URL cũ) → URL mới của app tương ứng */
function AdminRedirect() {
  const tab = new URLSearchParams(useLocation().search).get("tab") ?? "dash";
  return <Navigate to={LEGACY_ADMIN_TABS[tab] ?? LEGACY_ADMIN_TABS.dash} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <HistoryTracker />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Welcome />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login/phone" element={<CompletePhone />} />
          <Route path="/login/link" element={<LinkAccount />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/:section" element={<Account />} />
          <Route path="/about" element={page(<About />)} />
          <Route path="/stores" element={page(<Stores />)} />
          <Route path="/stores/:id" element={page(<StoreDetail />)} />
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
          <Route path="/game/:campaignId" element={<GamePlay />} />
          <Route path="/policy/:slug" element={<Policy />} />
          <Route path="/privacy" element={<Policy slug="privacy" />} />
          <Route path="/data-deletion" element={<Policy slug="data-deletion" />} />
          <Route path="/contact" element={<Contact />} />
        </Route>

        <Route path="/welcome" element={<Navigate to="/login" replace />} />

        {/* SUPPLIER PORTAL (Standalone) */}
        <Route path="/supplier" element={<SupplierPortal />} />

        {/* KHU VỰC NHÂN SỰ — khung ERP */}
        <Route path="/app/*" element={<AppShell />} />
        <Route path="/pos" element={<AppShell />} />

        {/* Chuyển hướng URL cũ */}
        <Route path="/admin" element={<AdminRedirect />} />
        {Object.entries(LEGACY_PATHS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
