import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import SetupGuide from "./pages/SetupGuide";
import GoogleCallback from "./pages/GoogleCallback";
import ProfileSettings from "./pages/ProfileSettings";
import NotFound from "./pages/NotFound";
import FloatingAoriHead from "./components/FloatingAoriHead";
import DraggableCutout from "./components/DraggableCutout";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-screen bg-background" />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    const check = async () => {
      // Fast path: localStorage cache
      if (localStorage.getItem("aori-onboarded") === "true") {
        setOnboarded(true);
        setChecking(false);
        return;
      }
      // Slow path: check DB
      if (user) {
        const { data } = await supabase
          .from("user_profiles")
          .select("id, name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.name) {
          localStorage.setItem("aori-onboarded", "true");
          localStorage.setItem("aori-user-name", data.name);
          setOnboarded(true);
        }
      }
      setChecking(false);
    };
    check();
  }, [user]);

  if (checking) return <div className="h-screen w-screen bg-background" />;
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RedirectIfOnboarded({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (localStorage.getItem("aori-onboarded") === "true") {
        setOnboarded(true);
        setChecking(false);
        return;
      }
      if (user) {
        const { data } = await supabase
          .from("user_profiles")
          .select("id, name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.name) {
          localStorage.setItem("aori-onboarded", "true");
          localStorage.setItem("aori-user-name", data.name);
          setOnboarded(true);
        }
      }
      setChecking(false);
    };
    check();
  }, [user]);

  if (checking) return <div className="h-screen w-screen bg-background" />;
  if (onboarded) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState(false);
  const [checkingOnboard, setCheckingOnboard] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (localStorage.getItem("aori-onboarded") === "true") {
        setOnboarded(true);
        setCheckingOnboard(false);
        return;
      }
      if (user) {
        const { data } = await supabase
          .from("user_profiles")
          .select("id, name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.name) {
          localStorage.setItem("aori-onboarded", "true");
          localStorage.setItem("aori-user-name", data.name);
          setOnboarded(true);
        }
      }
      setCheckingOnboard(false);
    };
    if (!loading) check();
  }, [user, loading]);

  if (loading || checkingOnboard) return <div className="h-screen w-screen bg-background" />;

  return (
    <>
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
        <Route path="/onboarding" element={
          <RequireAuth><RedirectIfOnboarded><Onboarding /></RedirectIfOnboarded></RequireAuth>
        } />
        <Route path="/" element={
          <RequireAuth><RequireOnboarding><div className="h-screen w-screen bg-background"><DraggableCutout /></div></RequireOnboarding></RequireAuth>
        } />
        <Route path="/setup" element={
          <RequireAuth><RequireOnboarding><SetupGuide /></RequireOnboarding></RequireAuth>
        } />
        <Route path="/google-callback" element={
          <RequireAuth><GoogleCallback /></RequireAuth>
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
