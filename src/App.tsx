import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import SetupGuide from "./pages/SetupGuide";
import ProfileSettings from "./pages/ProfileSettings";
import NotFound from "./pages/NotFound";
import FloatingAoriHead from "./components/FloatingAoriHead";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-screen bg-background" />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const onboarded = localStorage.getItem("aori-onboarded") === "true";
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RedirectIfOnboarded({ children }: { children: React.ReactNode }) {
  const onboarded = localStorage.getItem("aori-onboarded") === "true";
  if (onboarded) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const onboarded = localStorage.getItem("aori-onboarded") === "true";

  if (loading) return <div className="h-screen w-screen bg-background" />;

  return (
    <>
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
        <Route path="/onboarding" element={
          <RequireAuth><RedirectIfOnboarded><Onboarding /></RedirectIfOnboarded></RequireAuth>
        } />
        <Route path="/" element={
          <RequireAuth><RequireOnboarding><div className="h-screen w-screen" /></RequireOnboarding></RequireAuth>
        } />
        <Route path="/setup" element={
          <RequireAuth><RequireOnboarding><SetupGuide /></RequireOnboarding></RequireAuth>
        } />
        <Route path="/profile" element={
          <RequireAuth><RequireOnboarding><ProfileSettings /></RequireOnboarding></RequireAuth>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {user && onboarded && <FloatingAoriHead />}
    </>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
