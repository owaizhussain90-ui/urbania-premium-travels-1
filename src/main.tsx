import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { BookingProvider } from './contexts/BookingContext';
import { BookingLayout, CustomerLayout, RequireAdmin } from './layouts/layouts';
import './index.css';

const L = (f: () => Promise<any>, n: string) => lazy(() => f().then((m) => ({ default: m[n] })));
const Splash = L(() => import('./pages/auth/Splash'), 'Splash');
const Onboarding = L(() => import('./pages/auth/Splash'), 'Onboarding');
const Login = L(() => import('./pages/auth/Login'), 'Login');
const AdminLogin = L(() => import('./pages/auth/Login'), 'AdminLogin');
const Home = L(() => import('./pages/customer/Home'), 'Home');
const Profile = L(() => import('./pages/customer/Profile'), 'Profile');
const Notifications = L(() => import('./pages/customer/Profile'), 'Notifications');
const Terms = L(() => import('./pages/customer/Profile'), 'Terms');
const NotFound = L(() => import('./pages/customer/Profile'), 'NotFound');
const Bookings = L(() => import('./pages/customer/Bookings'), 'Bookings');
const BookingDetail = L(() => import('./pages/customer/Bookings'), 'BookingDetail');
const Step1 = L(() => import('./pages/booking/Steps'), 'Step1');
const Step2 = L(() => import('./pages/booking/Steps'), 'Step2');
const Step3 = L(() => import('./pages/booking/Steps'), 'Step3');
const Step4 = L(() => import('./pages/booking/Steps'), 'Step4');
const Confirmation = L(() => import('./pages/booking/Steps'), 'Confirmation');
const Dashboard = L(() => import('./pages/admin/Admin'), 'Dashboard');
const AdminBooking = L(() => import('./pages/admin/Admin'), 'AdminBooking');
const FareConfig = L(() => import('./pages/admin/Admin'), 'FareConfig');

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <BookingProvider>
              <Routes>
                <Route path="/" element={<Navigate to="/splash" replace />} />
                <Route path="/splash" element={<Splash />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/auth/login" element={<Login />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/terms" element={<Terms />} />

                <Route element={<CustomerLayout />}>
                  <Route path="/home" element={<Home />} />
                  <Route path="/bookings" element={<Bookings />} />
                  <Route path="/bookings/:id" element={<BookingDetail />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/booking/confirmation" element={<Confirmation />} />
                  <Route element={<BookingLayout />}>
                    <Route path="/booking/step-1" element={<Step1 />} />
                    <Route path="/booking/step-2" element={<Step2 />} />
                    <Route path="/booking/step-3" element={<Step3 />} />
                    <Route path="/booking/step-4" element={<Step4 />} />
                  </Route>
                </Route>

                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="/admin/dashboard" element={<Dashboard />} />
                  <Route path="/admin/booking/:id" element={<AdminBooking />} />
                  <Route path="/admin/fares" element={<FareConfig />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BookingProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
