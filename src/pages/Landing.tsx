import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Users, Clock, Trophy, Shield, DollarSign } from "lucide-react";
import { useEffect } from "react";

const Landing = () => {
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
  }, []);

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-card to-secondary/20">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="relative container mx-auto px-4 py-20 lg:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent leading-tight">
              Master Checkers<br/>
              <span className="text-foreground">Win Real Money</span>
            </h1>
            <p className="text-xl lg:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Join thousands of players in the most competitive online checkers arena. 
              Professional gaming with <span className="text-primary font-semibold">real stakes</span> and 
              <span className="text-accent font-semibold"> instant payouts</span>.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link to="/auth">
                <Button size="lg" className="kick-button text-lg px-8 py-6 hover:scale-105 transition-all duration-300">
                  Start Playing Now
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="lg" className="kick-button-secondary text-lg px-8 py-6">
                  Watch Live Games
                </Button>
              </Link>
            </div>
            
            {/* Social Proof */}
            <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span>10,000+ Active Players</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-success" />
                <span>$50K+ Paid Out Weekly</span>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-warning" />
                <span>Daily Tournaments</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-foreground">
              Why Players Choose <span className="text-primary">Checkers Arena</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Experience the most advanced checkers platform with features designed for serious players
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="glass-card p-8 hover:scale-105 transition-all duration-300 border-2 border-border/50 hover:border-primary/50">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-4">Lightning Fast Games</h3>
                <p className="text-muted-foreground">
                  2-minute per move timer keeps games exciting and competitive. No more waiting around!
                </p>
              </div>
            </Card>

            <Card className="glass-card p-8 hover:scale-105 transition-all duration-300 border-2 border-border/50 hover:border-accent/50">
              <div className="text-center">
                <div className="w-16 h-16 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Shield className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-xl font-bold mb-4">Secure & Fair</h3>
                <p className="text-muted-foreground">
                  Advanced anti-cheat system and encrypted transactions ensure fair play for everyone.
                </p>
              </div>
            </Card>

            <Card className="glass-card p-8 hover:scale-105 transition-all duration-300 border-2 border-border/50 hover:border-success/50">
              <div className="text-center">
                <div className="w-16 h-16 bg-success/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <DollarSign className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-xl font-bold mb-4">Instant Payouts</h3>
                <p className="text-muted-foreground">
                  Win and get paid instantly via M-Pesa. No waiting periods or complicated withdrawals.
                </p>
              </div>
            </Card>

            <Card className="glass-card p-8 hover:scale-105 transition-all duration-300 border-2 border-border/50 hover:border-warning/50">
              <div className="text-center">
                <div className="w-16 h-16 bg-warning/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Trophy className="w-8 h-8 text-warning" />
                </div>
                <h3 className="text-xl font-bold mb-4">Tournaments & Rankings</h3>
                <p className="text-muted-foreground">
                  Compete in daily tournaments and climb the leaderboards for bigger prizes.
                </p>
              </div>
            </Card>

            <Card className="glass-card p-8 hover:scale-105 transition-all duration-300 border-2 border-border/50 hover:border-info/50">
              <div className="text-center">
                <div className="w-16 h-16 bg-info/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Users className="w-8 h-8 text-info" />
                </div>
                <h3 className="text-xl font-bold mb-4">Active Community</h3>
                <p className="text-muted-foreground">
                  Join thousands of passionate checkers players from around the world.
                </p>
              </div>
            </Card>

            <Card className="glass-card p-8 hover:scale-105 transition-all duration-300 border-2 border-border/50 hover:border-primary/50">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-4">Easy to Start</h3>
                <p className="text-muted-foreground">
                  Sign up in seconds and start playing immediately. No downloads or installations needed.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Start Winning in 3 Simple Steps</h2>
            <p className="text-xl text-muted-foreground">Get started and earn money playing checkers today</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-primary">
                1
              </div>
              <h3 className="text-xl font-bold mb-4">Create Account</h3>
              <p className="text-muted-foreground">
                Sign up with your email and deposit funds via M-Pesa to get started
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-accent">
                2
              </div>
              <h3 className="text-xl font-bold mb-4">Choose Your Stakes</h3>
              <p className="text-muted-foreground">
                Select your comfort level and get matched with players of similar skill
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-success">
                3
              </div>
              <h3 className="text-xl font-bold mb-4">Play & Win</h3>
              <p className="text-muted-foreground">
                Outplay your opponent and win instantly. Earnings are paid out immediately
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Ready to Turn Your Skills Into <span className="text-success">Cash?</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of players already earning money playing checkers. Start your winning streak today!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="kick-button text-xl px-12 py-6 hover:scale-105 transition-all duration-300">
                Start Playing Now - It's Free!
              </Button>
            </Link>
          </div>
          
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-success mb-2">$0</div>
              <div className="text-sm text-muted-foreground">Sign Up Cost</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">2min</div>
              <div className="text-sm text-muted-foreground">To Start Playing</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent mb-2">24/7</div>
              <div className="text-sm text-muted-foreground">Games Available</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h3 className="text-2xl font-bold mb-4 gradient-accent bg-clip-text text-transparent">
              Checkers Arena
            </h3>
            <p className="text-muted-foreground mb-6">
              The ultimate destination for competitive online checkers
            </p>
            <div className="flex justify-center gap-6">
              <Link to="/auth" className="text-primary hover:text-primary/80 transition-colors">
                Sign Up
              </Link>
              <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors">
                Login
              </Link>
            </div>
            <div className="mt-8 pt-8 border-t border-border text-sm text-muted-foreground">
              © 2024 Checkers Arena. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
};

export default Landing;