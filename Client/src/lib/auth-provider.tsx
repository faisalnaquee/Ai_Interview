import React, { createContext, useContext, useState } from "react";
import {
  ClerkProvider as RealClerkProvider,
  SignedIn as RealSignedIn,
  SignedOut as RealSignedOut,
  RedirectToSignIn as RealRedirectToSignIn,
  UserButton as RealUserButton,
  SignInButton as RealSignInButton,
  SignUpButton as RealSignUpButton,
  useUser as realUseUser,
} from "@clerk/clerk-react";
import { User, LogOut, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const hasRealClerk = Boolean(PUBLISHABLE_KEY && PUBLISHABLE_KEY.startsWith("pk_"));

interface MockAuthContextType {
  isSignedIn: boolean;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    primaryEmailAddress: { emailAddress: string };
    imageUrl?: string;
  } | null;
  signIn: () => void;
  signOut: () => void;
}

const MockAuthContext = createContext<MockAuthContextType>({
  isSignedIn: true,
  user: {
    id: "user_mock_candidate",
    firstName: "Demo",
    lastName: "Candidate",
    fullName: "Demo Candidate",
    primaryEmailAddress: { emailAddress: "demo@mockhire.me" },
  },
  signIn: () => {},
  signOut: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSignedIn, setIsSignedIn] = useState(true);

  if (hasRealClerk && PUBLISHABLE_KEY) {
    return (
      <RealClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        {children}
      </RealClerkProvider>
    );
  }

  const mockUser = isSignedIn
    ? {
        id: "user_mock_candidate",
        firstName: "Demo",
        lastName: "Candidate",
        fullName: "Demo Candidate",
        primaryEmailAddress: { emailAddress: "demo@mockhire.me" },
      }
    : null;

  return (
    <MockAuthContext.Provider
      value={{
        isSignedIn,
        user: mockUser,
        signIn: () => setIsSignedIn(true),
        signOut: () => setIsSignedIn(false),
      }}
    >
      {children}
    </MockAuthContext.Provider>
  );
};

export const SignedIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (hasRealClerk) return <RealSignedIn>{children}</RealSignedIn>;
  const { isSignedIn } = useContext(MockAuthContext);
  return isSignedIn ? <>{children}</> : null;
};

export const SignedOut: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (hasRealClerk) return <RealSignedOut>{children}</RealSignedOut>;
  const { isSignedIn } = useContext(MockAuthContext);
  return !isSignedIn ? <>{children}</> : null;
};

export const RedirectToSignIn: React.FC = () => {
  if (hasRealClerk) return <RealRedirectToSignIn />;
  return null;
};

export const useUser = () => {
  if (hasRealClerk) return realUseUser();
  const { user, isSignedIn } = useContext(MockAuthContext);
  return {
    isLoaded: true,
    isSignedIn,
    user,
  };
};

export const UserButton: React.FC<{ afterSignOutUrl?: string }> = () => {
  if (hasRealClerk) return <RealUserButton afterSignOutUrl="/" />;
  const { user, signOut } = useContext(MockAuthContext);
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold border border-primary/30"
        title={user?.fullName || "User"}
      >
        {user?.firstName?.[0] || "U"}
      </div>
      <button
        onClick={signOut}
        title="Sign Out (Demo)"
        className="text-xs text-muted-foreground hover:text-foreground p-1 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const SignInButton: React.FC<{ mode?: string; children?: React.ReactNode }> = ({ children }) => {
  if (hasRealClerk) return <RealSignInButton mode="modal">{children}</RealSignInButton>;
  const { signIn } = useContext(MockAuthContext);
  return (
    <span onClick={signIn} className="cursor-pointer">
      {children || <Button variant="ghost">Sign In</Button>}
    </span>
  );
};

export const SignUpButton: React.FC<{ mode?: string; children?: React.ReactNode }> = ({ children }) => {
  if (hasRealClerk) return <RealSignUpButton mode="modal">{children}</RealSignUpButton>;
  const { signIn } = useContext(MockAuthContext);
  return (
    <span onClick={signIn} className="cursor-pointer">
      {children || <Button>Sign Up</Button>}
    </span>
  );
};
