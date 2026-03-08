import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Onboarding from "./pages/Onboarding";
import SetupGuide from "./pages/SetupGuide";
import NotFound from "./pages/NotFound";
import FloatingAoriHead from "./components/FloatingAoriHead";

const queryClient = new QueryClient();

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

const App = () => {
  const onboarded = localStorage.getItem("aori-onboarded") === "true";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/onboarding" element={<RedirectIfOnboarded><Onboarding /></RedirectIfOnboarded>} />
            <Route path="/" element={<RequireOnboarding><div className="h-screen w-screen" /></RequireOnboarding>} />
            <Route path="/setup" element={<RequireOnboarding><SetupGuide /></RequireOnboarding>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        {onboarded && <FloatingAoriHead />}
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
