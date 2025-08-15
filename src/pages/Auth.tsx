import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const setSeo = () => {
  document.title = "Sign in or Sign up | Checkers Platform";
  const description = "Login or create an account to play online checkers and place stakes.";

  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", description);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", window.location.href);
};

export default function Auth() {
  const navigate = useNavigate();
  const [emailLogin, setEmailLogin] = useState("");
  const [passwordLogin, setPasswordLogin] = useState("");
  const [emailSignup, setEmailSignup] = useState("");
  const [passwordSignup, setPasswordSignup] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSeo();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Only sync state and navigate outside of Supabase calls
      if (session) {
        // Defer navigation to avoid blocking callback
        setTimeout(() => navigate("/lobby", { replace: true }), 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/lobby", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailLogin,
      password: passwordLogin,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Unable to sign in");
      return;
    }
    toast.success("Signed in successfully");
    navigate("/lobby", { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email: emailSignup,
      password: passwordSignup,
      options: { emailRedirectTo: redirectUrl },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Unable to sign up");
      return;
    }
    toast.success("Check your email to confirm your account.");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <article className="w-full max-w-md rounded-lg border border-input bg-card p-6 shadow-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Account Access</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in or create an account to continue</p>
        </header>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-4">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-login">Email</Label>
                <Input
                  id="email-login"
                  type="email"
                  value={emailLogin}
                  onChange={(e) => setEmailLogin(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-login">Password</Label>
                <Input
                  id="password-login"
                  type="password"
                  value={passwordLogin}
                  onChange={(e) => setPasswordLogin(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : "Sign In"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-signup">Email</Label>
                <Input
                  id="email-signup"
                  type="email"
                  value={emailSignup}
                  onChange={(e) => setEmailSignup(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-signup">Password</Label>
                <Input
                  id="password-signup"
                  type="password"
                  value={passwordSignup}
                  onChange={(e) => setPasswordSignup(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <footer className="mt-6 text-center text-sm text-muted-foreground">
          <span>By continuing you agree to our terms.</span>
          <div className="mt-2">
            <Link to="/" className="underline underline-offset-4">Back to Home</Link>
          </div>
        </footer>
      </article>
    </main>
  );
}
