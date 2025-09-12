import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import heroImage from "@/assets/checkers-hero-bg.jpg";

const Landing = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    document.title = "Checkers Arena - Play Online Checkers for Real Stakes";
    const description = "Join the ultimate online checkers platform. Play against real opponents with real stakes. Professional gaming experience with 2-minute timers and live tournaments.";
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

    // Check authentication status and redirect if logged in
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (sess) {
        navigate("/lobby", { replace: true });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        navigate("/lobby", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/95 backdrop-blur-sm border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link to="/" className="text-2xl font-bold text-white">
                Checkers Arena
              </Link>
              <div className="hidden md:flex space-x-6">
                <Link to="/auth" className="text-white/80 hover:text-white transition-colors">
                  Premium
                </Link>
                <Link to="/auth" className="text-white/80 hover:text-white transition-colors">
                  Support
                </Link>
                <Link to="/auth" className="text-white/80 hover:text-white transition-colors">
                  Download
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/auth" className="text-white/80 hover:text-white transition-colors">
                Sign up
              </Link>
              <Link to="/auth" className="text-white/80 hover:text-white transition-colors">
                Log in
              </Link>
              <Link to="/auth">
                <Button className="bg-kick-green hover:bg-kick-green/90 text-black font-bold px-8 py-3 rounded-full">
                  Play for free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        >
          <div className="absolute inset-0 bg-black/50"></div>
        </div>
        
        <div className="relative z-10 container mx-auto px-6 py-32">
          <div className="max-w-2xl">
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-black mb-8 leading-none">
              The ultimate
              <br />
              arena for
              <br />
              <span className="italic">checkers</span>
            </h1>
            
            <div className="mb-12 text-white/80">
              <p className="text-lg mb-2">
                Individual games start at $5. Free for 3
              </p>
              <p className="text-lg mb-2">
                games, then $10 per game after.
              </p>
              <p className="text-lg">
                Offer only available if you haven't tried
              </p>
              <p className="text-lg">
                Premium before. <Link to="/auth" className="underline hover:no-underline">Terms apply</Link>. Offer ends
              </p>
              <p className="text-lg">
                December 31, 2024.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-gradient-to-b from-black to-gray-900">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-kick-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="w-10 h-10 bg-kick-green rounded-full"></div>
              </div>
              <h3 className="text-2xl font-bold mb-4">Lightning Fast</h3>
              <p className="text-white/70">
                2-minute timer keeps games exciting. No more waiting around for slow players.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="w-10 h-10 bg-blue-500 rounded-full"></div>
              </div>
              <h3 className="text-2xl font-bold mb-4">Real Money</h3>
              <p className="text-white/70">
                Win actual cash prizes. Instant payouts via M-Pesa with no fees.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="w-10 h-10 bg-purple-500 rounded-full"></div>
              </div>
              <h3 className="text-2xl font-bold mb-4">Tournament Play</h3>
              <p className="text-white/70">
                Daily tournaments with bigger prizes. Climb leaderboards for glory.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="w-10 h-10 bg-yellow-500 rounded-full"></div>
              </div>
              <h3 className="text-2xl font-bold mb-4">Secure Gaming</h3>
              <p className="text-white/70">
                Advanced anti-cheat system ensures fair play for all competitors.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Simple CTA */}
      <section className="py-32 text-center">
        <div className="container mx-auto px-6">
          <h2 className="text-5xl md:text-6xl font-black mb-8">
            Start winning today.
          </h2>
          <Link to="/auth">
            <Button className="bg-kick-green hover:bg-kick-green/90 text-black font-bold text-xl px-12 py-4 rounded-full">
              Play free for 3 games
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10">
        <div className="container mx-auto px-6">
          <div className="text-center text-white/60">
            <p className="mb-4">© 2024 Checkers Arena</p>
            <div className="flex justify-center gap-6 text-sm">
              <Link to="/auth" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/auth" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/auth" className="hover:text-white transition-colors">Support</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;