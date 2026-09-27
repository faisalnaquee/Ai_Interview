import Landing from "@/page/Landing";
import Form from "@/page/Form";
import Interview from "@/page/Interview";
import Result from "@/page/Result";
import AtsChecker from "@/page/AtsChecker";
import Dashboard from "@/page/Dashboard";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, SignedIn, SignedOut, RedirectToSignIn } from "@/lib/auth-provider";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GlobalNavbar from "@/components/layout/GlobalNavbar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/context/ThemeContext";
import React from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <SignedIn>
        {children}
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
};

const PageTransition = ({ children }: { children: React.ReactNode }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
};

import Contact from "@/page/Contact";
import AssessmentSetup from "@/page/AssessmentSetup";
import AssessmentProgress from "@/page/AssessmentProgress";
import AssessmentResult from "@/page/AssessmentResult";

const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Public Routes */}
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          <Route path="/ats" element={<PageTransition><AtsChecker /></PageTransition>} />
          <Route path="/contact" element={<PageTransition><Contact /></PageTransition>} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <PageTransition><Dashboard /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/setup" element={
            <ProtectedRoute>
              <PageTransition><Form /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/interview/:id" element={
            <ProtectedRoute>
              <PageTransition><Interview /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/result/:id" element={
            <ProtectedRoute>
              <PageTransition><Result /></PageTransition>
            </ProtectedRoute>
          } />

          {/* Assessment Routes */}
          <Route path="/assessment/setup" element={
            <ProtectedRoute>
              <PageTransition><AssessmentSetup /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/assessment/:id/progress" element={
            <ProtectedRoute>
              <PageTransition><AssessmentProgress /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/assessment/:id/result" element={
            <ProtectedRoute>
              <PageTransition><AssessmentResult /></PageTransition>
            </ProtectedRoute>
          } />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
};

import { InitialLoader } from "@/components/ui/InitialLoader";
import { useState, useEffect } from "react";

const App = () => {
  const [showLoader, setShowLoader] = useState(true);

  // Prevent scrolling while loader is active
  useEffect(() => {
    if (showLoader) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [showLoader]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            {showLoader && <InitialLoader onComplete={() => setShowLoader(false)} />}
            <div className={`transition-opacity duration-700 ${showLoader ? 'opacity-0' : 'opacity-100'}`}>
              <GlobalNavbar />
              <AnimatedRoutes />
              <Toaster position="top-right" />
            </div>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
