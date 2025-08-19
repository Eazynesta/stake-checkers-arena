import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const me = useMemo(() => ({ id: session?.user.id ?? "", email: session?.user.email ?? "" }), [session]);

  const [username, setUsername] = useState("");
  const [balance, setBalance] = useState(0);
  const [gamesWon, setGamesWon] = useState(0);
  const [gamesLost, setGamesLost] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [amount, setAmount] = useState<number>(10);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);

  // SEO basics
  useEffect(() => {
    document.title = "Player Dashboard | Checkers";
    const description = "Manage username, deposit or withdraw dummy funds, and view your stats.";
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/auth", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadProfile = async () => {
    if (!me.id) return;
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("username, balance, games_won, games_lost, earnings, phone_number")
      .eq("id", me.id)
      .maybeSingle();
    if (error || !data) {
      try {
        await (supabase as any).from("profiles").insert({ id: me.id, username: me.email.split("@")[0] });
      } catch (_) {}
      const { data: d2 } = await (supabase as any)
        .from("profiles")
        .select("username, balance, games_won, games_lost, earnings, phone_number")
        .eq("id", me.id)
        .maybeSingle();
      if (d2) applyProfile(d2);
    } else {
      applyProfile(data);
    }
  };

  const applyProfile = (p: any) => {
    setUsername(p.username ?? "");
    setBalance(Number(p.balance ?? 0));
    setGamesWon(Number(p.games_won ?? 0));
    setGamesLost(Number(p.games_lost ?? 0));
    setEarnings(Number(p.earnings ?? 0));
    setPhoneNumber(p.phone_number ?? "");
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const saveProfile = async () => {
    if (!username.trim()) return;
    const { error } = await (supabase as any).from("profiles").update({ 
      username,
      phone_number: phoneNumber 
    }).eq("id", me.id);
    if (error) toast.error("Failed to update profile");
    else {
      toast.success("Profile updated");
      loadProfile();
    }
  };

  const deposit = async () => {
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    if (!phoneNumber.trim()) return toast.error("Enter your phone number");
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
        body: { 
          amount: amount.toString(), 
          phone_number: phoneNumber.startsWith('+254') ? phoneNumber : `+254${phoneNumber.replace(/^0/, '')}`
        }
      });
      
      if (error) throw error;
      
      toast.success("STK Push sent! Check your phone to complete payment");
      loadProfile();
    } catch (error: any) {
      toast.error(error.message || "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async () => {
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    if (!phoneNumber.trim()) return toast.error("Enter your phone number");
    if (balance < amount) return toast.error("Insufficient balance");
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mpesa-b2c', {
        body: { 
          amount: amount.toString(), 
          phone_number: phoneNumber.startsWith('+254') ? phoneNumber : `+254${phoneNumber.replace(/^0/, '')}`
        }
      });
      
      if (error) throw error;
      
      toast.success("Withdrawal initiated! You'll receive the money shortly");
      loadProfile();
    } catch (error: any) {
      toast.error(error.message || "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <section className="w-full max-w-3xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Player Dashboard</h1>
            <p className="text-muted-foreground">Signed in as {me.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/')}>Back to Lobby</Button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <article className="rounded-lg border border-border p-4 bg-card/50 space-y-3">
            <h2 className="font-semibold">Profile</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Username</label>
                <Input value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Phone Number (M-Pesa)</label>
                <Input 
                  value={phoneNumber} 
                  onChange={(e) => setPhoneNumber(e.currentTarget.value)}
                  placeholder="0712345678 or +254712345678"
                />
              </div>
              <Button onClick={saveProfile} disabled={loading}>Save Profile</Button>
            </div>
          </article>

          <article className="rounded-lg border border-border p-4 bg-card/50 space-y-3">
            <h2 className="font-semibold text-casino-gold">💰 M-Pesa Wallet</h2>
            <p className="text-lg font-bold text-casino-gold">Balance: KSh {balance.toFixed(2)}</p>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input 
                  type="number" 
                  min={1} 
                  step="1" 
                  className="w-28 sm:w-32" 
                  value={amount} 
                  onChange={(e) => setAmount(Number(e.currentTarget.value))}
                  placeholder="Amount"
                />
                <Button 
                  onClick={deposit} 
                  disabled={loading || !phoneNumber}
                  className="bg-casino-green hover:bg-casino-green/90"
                >
                  {loading ? "Processing..." : "🏦 Deposit"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={withdraw}
                  disabled={loading || !phoneNumber || balance < amount}
                  className="border-casino-red text-casino-red hover:bg-casino-red/10"
                >
                  {loading ? "Processing..." : "💸 Withdraw"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Real M-Pesa integration (Sandbox). Add your phone number above.
              </p>
            </div>
          </article>

          <article className="md:col-span-2 rounded-lg border border-border p-4 bg-card/50 space-y-3">
            <h2 className="font-semibold">Statistics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Games Won</p>
                <p className="text-xl font-semibold">{gamesWon}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Games Lost</p>
                <p className="text-xl font-semibold">{gamesLost}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Earnings</p>
                <p className="text-xl font-semibold">{earnings.toFixed(2)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Current Balance</p>
                <p className="text-xl font-semibold">{balance.toFixed(2)}</p>
              </div>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
