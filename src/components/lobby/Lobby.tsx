import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";

interface LobbyProps {
  session: Session | null;
  onLogout: () => void;
}

interface PresenceUser {
  id: string;
  email: string;
  online_at: string;
}

interface Invite {
  from: string;
  fromEmail: string;
  to: string;
  gameId: string;
  stake: number;
  at: string;
}

interface TopPlayer {
  user_id: string;
  username: string;
  games_won: number;
  games_lost: number;
  earnings: number;
}

const Lobby = ({ session, onLogout }: LobbyProps) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [stake, setStake] = useState<number>(10);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [sentInvites, setSentInvites] = useState<Invite[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [leaders, setLeaders] = useState<TopPlayer[]>([]);
  const [leadersLoading, setLeadersLoading] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const me = useMemo(() => {
    return {
      id: session?.user.id ?? "",
      email: session?.user.email ?? "unknown@user",
    };
  }, [session]);

  useEffect(() => {
    if (!me.id) return;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("profiles")
          .select("balance, username")
          .eq("id", me.id)
          .maybeSingle();

        if (error || !data) {
          try {
            await (supabase as any).from("profiles").insert({ id: me.id, username: me.email.split("@")[0] });
          } catch (_) {}
          const { data: d2 } = await (supabase as any)
            .from("profiles")
            .select("balance, username")
            .eq("id", me.id)
            .maybeSingle();
          setBalance(Number((d2?.balance ?? 0) as number));
        } else {
          setBalance(Number((data?.balance ?? 0) as number));
        }
      } catch (_) {
        // ignore
      }
    })();
  }, [me.id]);

  useEffect(() => {
    if (!me.id) return;
    let active = true;
    setLeadersLoading(true);
    (supabase as any)
      .rpc("get_top_players", { limit_count: 10 })
      .then(({ data, error }: any) => {
        if (!active) return;
        if (!error) setLeaders(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (active) setLeadersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [me.id]);

  useEffect(() => {
    if (!me.id) return;
    (supabase as any).rpc('has_role', { _user_id: me.id, _role: 'admin' }).then(({ data }: any) => {
      setIsAdmin(!!data);
    }).catch(() => setIsAdmin(false));
  }, [me.id]);

  useEffect(() => {
    if (!me.id) return;

    const channel = supabase.channel("lobby", {
      config: { presence: { key: me.id } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ email: string; online_at: string }>>;
        const list: PresenceUser[] = Object.entries(state).map(([id, arr]) => ({
          id,
          email: arr[0]?.email ?? id,
          online_at: arr[0]?.online_at ?? new Date().toISOString(),
        }));
        // Exclude self
        setUsers(list.filter((u) => u.id !== me.id));
      })
      .on("broadcast", { event: "invite" }, ({ payload }) => {
        const { to, from, fromEmail, gameId, stake } = payload as { to: string; from: string; fromEmail: string; gameId: string; stake: number };
        if (to === me.id) {
          setReceivedInvites((prev) => [
            { from, fromEmail, to, gameId, stake, at: new Date().toISOString() },
            ...prev,
          ]);
        }
      })
      .on("broadcast", { event: "accept" }, ({ payload }) => {
        const { gameId, to, from, stake } = payload as { gameId: string; to: string; from: string; stake: number };
        if (from === me.id || to === me.id) {
          const key = `game_debited_${gameId}_${me.id}`;
          if (!localStorage.getItem(key)) {
            (supabase as any).rpc("debit_balance", { amount: stake }).then(({ data, error }) => {
              if (error || data !== true) {
                toast.error("Balance debit failed. Please check your balance.");
              } else {
                setBalance((b) => Math.max(0, Number((b - stake).toFixed(2))));
              }
            });
            localStorage.setItem(key, "1");
          }
          navigate(`/game/${gameId}?stake=${encodeURIComponent(stake)}`);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: me.email, online_at: new Date().toISOString() });
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [me, navigate]);

  useEffect(() => {
    const onFocus = () => {
      // Refresh leaderboard
      setLeadersLoading(true);
      (supabase as any).rpc('get_top_players', { limit_count: 10 }).then(({ data }: any) => {
        setLeaders(Array.isArray(data) ? data : []);
      }).finally(() => setLeadersLoading(false));
      // Nudge presence tracking
      if (channelRef.current) {
        channelRef.current.track({ email: me.email, online_at: new Date().toISOString() });
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [me.email]);

  const sendInvite = async (target: PresenceUser) => {
    if (!channelRef.current) return;
    if (target.id === me.id) {
      toast.error("You cannot invite yourself");
      return;
    }
    if (!stake || stake <= 0) {
      toast.error("Enter a valid stake amount");
      return;
    }
    if (balance < stake) {
      toast.error("Insufficient balance for this stake");
      return;
    }

    const gameId = crypto.randomUUID();
    const ok = await channelRef.current.send({
      type: "broadcast",
      event: "invite",
      payload: { to: target.id, from: me.id, fromEmail: me.email, gameId, stake },
    });
    if (ok) {
      setSentInvites((prev) => [
        { from: me.id, fromEmail: me.email, to: target.id, gameId, stake, at: new Date().toISOString() },
        ...prev,
      ]);
      toast.success(`Invite sent to ${target.email}`);
    } else {
      toast.error("Failed to send invite");
    }
  };

  const isOnline = (id: string) => users.some((u) => u.id === id);
  const inviteById = (id: string) => {
    const target = users.find((u) => u.id === id);
    if (target) return sendInvite(target);
    toast.info("This player is currently offline");
  };

  const acceptInvite = async (inv: Invite) => {
    if (!channelRef.current) return;
    if (balance < inv.stake) {
      toast.error("Your balance is too low to accept this match");
      return;
    }

    // Notify inviter
    const ok = await channelRef.current.send({
      type: "broadcast",
      event: "accept",
      payload: { gameId: inv.gameId, from: inv.from, to: me.id, stake: inv.stake },
    });

    if (ok) {
      setReceivedInvites((prev) => prev.filter((i) => i.gameId !== inv.gameId));

      // Important: the sender of a broadcast does NOT receive their own event.
      // So we must debit and navigate locally for the acceptor as well.
      const key = `game_debited_${inv.gameId}_${me.id}`;
      if (!localStorage.getItem(key)) {
        try {
          const { data, error } = await (supabase as any).rpc("debit_balance", { amount: inv.stake });
          if (error || data !== true) {
            toast.error("Balance debit failed. Please check your balance.");
            return;
          }
          setBalance((b) => Math.max(0, Number((b - inv.stake).toFixed(2))));
          localStorage.setItem(key, "1");
        } catch (_) {
          toast.error("Balance debit failed. Try again.");
          return;
        }
      }
      // Navigate acceptor into the game immediately
      navigate(`/game/${inv.gameId}?stake=${encodeURIComponent(inv.stake)}`);
    } else {
      toast.error("Failed to accept invite");
    }
  };

  const ignoreInvite = (inv: Invite) => {
    setReceivedInvites((prev) => prev.filter((i) => i.gameId !== inv.gameId));
  };

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Checkers Arena
            </h1>
            <p className="text-muted-foreground">Welcome, {me.email.split('@')[0]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="kick-button-secondary">
              Dashboard
            </Button>
            {isAdmin && (
              <Button variant="outline" onClick={() => navigate('/admin')} className="kick-button-secondary">
                Admin
              </Button>
            )}
            <Button onClick={onLogout} className="kick-button">
              Logout
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Match Settings */}
          <div className="glass-card p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              Match Settings
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium min-w-fit">Stake Amount</label>
                <Input 
                  type="number" 
                  min={1} 
                  step="0.01" 
                  value={stake} 
                  onChange={(e) => setStake(Number(e.currentTarget.value))} 
                  className="flex-1"
                />
              </div>
              <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg">
                <span className="text-sm font-medium">Your Balance</span>
                <span className="text-lg font-bold text-success">{balance.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Game Invites */}
          <div className="glass-card p-6 rounded-xl lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-accent rounded-full"></span>
              Game Invites
            </h2>
            {receivedInvites.length === 0 && sentInvites.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-2">No active invites</p>
                <p className="text-sm text-muted-foreground">Challenge a player to start a match!</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Received</h3>
                  {receivedInvites.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No incoming invites</p>
                  ) : (
                    <div className="space-y-2">
                      {receivedInvites.map((inv) => (
                        <div key={inv.gameId} className="p-4 bg-secondary/30 rounded-lg">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{inv.fromEmail.split('@')[0]}</p>
                              <p className="text-sm text-muted-foreground">Stake: {inv.stake}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => acceptInvite(inv)} className="kick-button">
                                Accept
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => ignoreInvite(inv)}>
                                Decline
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Sent</h3>
                  {sentInvites.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No outgoing invites</p>
                  ) : (
                    <div className="space-y-2">
                      {sentInvites.map((inv) => (
                        <div key={inv.gameId} className="p-4 bg-secondary/30 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{inv.to}</p>
                              <p className="text-sm text-muted-foreground">Stake: {inv.stake}</p>
                            </div>
                            <span className="text-xs text-warning font-medium px-2 py-1 bg-warning/10 rounded-full">
                              Pending
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Leaderboard */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span className="w-2 h-2 bg-warning rounded-full"></span>
                Leaderboard
              </h2>
              {leadersLoading && (
                <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>
              )}
            </div>
            {leaders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No rankings yet</p>
                <p className="text-sm text-muted-foreground mt-1">Be the first to play!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leaders.map((p, idx) => {
                  const online = isOnline(p.user_id);
                  const isTopThree = idx < 3;
                  const rankColors = ['text-warning', 'text-muted-foreground', 'text-accent'];
                  return (
                    <div 
                      key={p.user_id} 
                      className={`p-4 rounded-lg border transition-all duration-300 hover:scale-[1.02] ${
                        isTopThree ? 'bg-primary/5 border-primary/20' : 'bg-secondary/30 border-border/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-bold w-8 ${isTopThree ? rankColors[idx] : 'text-muted-foreground'}`}>
                            #{idx + 1}
                          </span>
                          <div>
                            <p className="font-semibold">{p.username || 'Player'}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Wins: {p.games_won}</span>
                              <span>Earnings: {Number(p.earnings).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${online ? 'bg-success' : 'bg-muted-foreground/50'}`}></div>
                            <span className="text-xs">{online ? 'Online' : 'Offline'}</span>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => inviteById(p.user_id)} 
                            disabled={!online}
                            className={online ? 'kick-button' : 'opacity-50'}
                          >
                            Challenge
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Online Players */}
          <div className="glass-card p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
              Online Players
            </h2>
            {users.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Waiting for players...</p>
                <p className="text-sm text-muted-foreground mt-1">You're the only one here right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-success rounded-full animate-pulse"></div>
                        <div>
                          <p className="font-medium">{u.email.split('@')[0]}</p>
                          <p className="text-xs text-muted-foreground">Active now</p>
                        </div>
                      </div>
                      <Button onClick={() => sendInvite(u)} className="kick-button">
                        Challenge
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
