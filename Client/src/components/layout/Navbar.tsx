import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@/lib/auth-provider";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { LogoIcon } from "@/components/ui/Logo";

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="fixed top-0 w-full bg-background/90 backdrop-blur-md z-50 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-3">
            <LogoIcon className="w-8 h-8" />
            <span className="font-bold text-xl tracking-tight flex items-center">
              <span className="text-foreground">Mock</span>
              <span className="text-primary">Hire</span>
            </span>
          </Link>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <div className="group relative py-2">
            <span className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1">
              Product
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="m6 9 6 6 6-6"/></svg>
            </span>
            <div className="absolute top-full left-0 w-48 bg-card border border-border rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 flex flex-col p-2 z-50">
              <Link to="/ats" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">ATS Analyzer</Link>
              <Link to="/setup" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">AI Interview</Link>
              <Link to="/assessment/setup" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">AI Assessment</Link>
            </div>
          </div>
          <Link to="/#how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
          <Link to="/#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="ghost" className="hidden sm:inline-flex">Log in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6">Get Started</Button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link to="/dashboard">
              <Button variant="outline" className="hidden sm:inline-flex rounded-full">Dashboard</Button>
            </Link>
            <Link to="/setup">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6">New Interview</Button>
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </nav>
  );
}

