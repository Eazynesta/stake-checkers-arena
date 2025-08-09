import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Lobby from "@/components/lobby/Lobby";

const Index = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Basic SEO
    document.title = "Home | Checkers Platform";
    const description = "Play online checkers with real-time lobby and stakes.";
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate("/auth", { replace: true });
  };

  return (
    <main className="min-h-screen flex items-start justify-center bg-background px-4 py-8">
      {!session ? (
        <section className="text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Checkers</h1>
          <p className="text-muted-foreground">Please sign in to join the lobby.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/auth" className="underline underline-offset-4">Go to Login</Link>
          </div>
        </section>
      ) : (
        <Lobby session={session} onLogout={handleLogout} />
      )}
    </main>
  );
};

export default Index;
