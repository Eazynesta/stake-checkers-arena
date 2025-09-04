import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import AppLayout from "@/components/layout/AppLayout";

type Color = "black" | "red";

type Cell = { color: Color; king?: boolean } | null;

type Board = Cell[][]; // 8x8

const BOARD_SIZE = 8;
const START_TIME = 120; // 2 minutes per turn

function createInitialBoard(): Board {
  const board: Board = Array.from({ length: BOARD_SIZE }, () => Array<Cell>(BOARD_SIZE).fill(null));
  // Black pieces at top (rows 0-2) on dark squares
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: "black" };
    }
  }
  // Red pieces at bottom (rows 5-7)
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: "red" };
    }
  }
  return board;
}

export default function GameRoom() {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stake = useMemo(() => Number(searchParams.get("stake") ?? 0), [searchParams]);

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<string[]>([]); // user ids
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [board, setBoard] = useState<Board>(() => createInitialBoard());
  const [turn, setTurn] = useState<Color>("black");
  const [clocks, setClocks] = useState<{ black: number; red: number }>({ black: START_TIME, red: START_TIME });
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [usernames, setUsernames] = useState<Record<string, string>>({});

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const endedRef = useRef(false);

  const me = useMemo(() => ({ 
    id: session?.user.id ?? "", 
    email: session?.user.email ?? "" 
  }), [session?.user.id, session?.user.email]);

  // SEO basics
  useEffect(() => {
    document.title = "Checkers Game | 2-min Turn Timer";
    const description = "Play checkers with 2-minute-per-move clocks and realtime sync.";
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

  // Auth session
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => {
      console.log('Auth state changed:', sess ? 'logged in' : 'logged out');
      setSession(sess);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session ? 'found' : 'not found');
      setSession(session);
      if (!session) {
        console.log('No session found, redirecting to auth');
        navigate("/auth", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Setup channel
  useEffect(() => {
    if (!gameId) {
      console.log('No gameId, skipping channel setup');
      return;
    }
    if (!me.id) {
      console.log('No user id, skipping channel setup');
      return;
    }
    
    console.log('Setting up channel for game:', gameId, 'user:', me.id);
    
    // Clean up any existing channel first
    if (channelRef.current) {
      console.log('Cleaning up existing channel');
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    const channel = supabase.channel(`game-${gameId}`, { 
      config: { 
        presence: { key: me.id },
        broadcast: { self: false, ack: true }
      } 
    });
    channelRef.current = channel;

    const handlePresenceSync = () => {
      const state = channel.presenceState();
      const ids = Object.keys(state).sort();
      console.log('Presence sync - raw state:', state);
      console.log('Presence sync - player IDs:', ids);
      console.log('My ID:', me.id, 'Am I in list?', ids.includes(me.id));
      
      setPlayers(ids);
      
      if (ids.length >= 2) {
        const myIdx = ids.indexOf(me.id);
        const color = myIdx === 0 ? "black" : myIdx === 1 ? "red" : null;
        console.log('Setting my color:', color, 'index:', myIdx, 'total players:', ids.length);
        setMyColor(color);
      } else {
        console.log('Not enough players yet:', ids.length, 'need 2');
        setMyColor(null);
      }
    };

    const handlePresenceJoin = ({ key, newPresences }) => {
      console.log('Player joined:', key, 'presences:', newPresences);
      // Trigger a manual sync to update state immediately
      setTimeout(handlePresenceSync, 100);
    };

    const handlePresenceLeave = ({ key, leftPresences }) => {
      console.log('Player left:', key, 'presences:', leftPresences);
      // Trigger a manual sync to update state immediately
      setTimeout(handlePresenceSync, 100);
    };

    channel
      .on("presence", { event: "sync" }, handlePresenceSync)
      .on("presence", { event: "join" }, handlePresenceJoin)
      .on("presence", { event: "leave" }, handlePresenceLeave)
      .on("broadcast", { event: "move" }, ({ payload }) => {
        const { board, turn, clocks } = payload as { board: Board; turn: Color; clocks: { black: number; red: number } };
        setBoard(board);
        setTurn(turn);
        setClocks(clocks);
      })
      .on("broadcast", { event: "tick" }, ({ payload }) => {
        const { clocks, turn } = payload as { clocks: { black: number; red: number }; turn: Color };
        setClocks(clocks);
        setTurn(turn);
      })
      .on("broadcast", { event: "game_over" }, ({ payload }) => {
        const { winnerId, stake: s } = payload as { winnerId: string; stake: number };
        handleGameOver(winnerId, s);
      })
      .subscribe(async (status) => {
        console.log('Channel subscription status:', status);
        if (status === "SUBSCRIBED") {
          console.log('Channel subscribed, tracking presence for:', me.email, 'user ID:', me.id);
          
          // Wait a bit for the subscription to be fully established
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const presenceData = { 
            email: me.email, 
            userId: me.id,
            joinedAt: new Date().toISOString(),
            gameId: gameId
          };
          
          console.log('Tracking presence with data:', presenceData);
          const trackResult = await channel.track(presenceData);
          console.log('Track result:', trackResult);
          
          // Force a presence sync after tracking
          setTimeout(() => {
            console.log('Forcing presence sync check...');
            const currentState = channel.presenceState();
            console.log('Current presence state after tracking:', currentState);
          }, 1000);
        } else if (status === "CHANNEL_ERROR") {
          console.error('Channel subscription error');
        } else if (status === "TIMED_OUT") {
          console.error('Channel subscription timed out');
        }
      });

    return () => {
      console.log('Cleaning up channel for game:', gameId);
      if (channelRef.current) {
        const currentChannel = channelRef.current;
        console.log('Untracking presence before cleanup');
        currentChannel.untrack().then(() => {
          console.log('Successfully untracked presence');
        }).catch((err) => {
          console.error('Error untracking presence:', err);
        });
        supabase.removeChannel(currentChannel);
        channelRef.current = null;
      }
    };
  }, [gameId, me.id, me.email]);

  // Fetch usernames for players list
  useEffect(() => {
    if (!players.length) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, username')
        .in('id', players);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        map[r.id] = r.username || 'Player';
      });
      setUsernames(map);
    })();
  }, [players]);

  // Host clock tick (player[0])
  useEffect(() => {
    if (!players.length) return;
    const isHost = players[0] === me.id;
    if (!isHost || gameOver) return;

    const interval = setInterval(() => {
      setClocks((prev) => {
        const next = { ...prev };
        // Only count down the current player's time
        if (turn === "black") {
          next.black = Math.max(0, prev.black - 1);
        } else if (turn === "red") {
          next.red = Math.max(0, prev.red - 1);
        }

        // Broadcast tick
        channelRef.current?.send({ type: "broadcast", event: "tick", payload: { clocks: next, turn } });

        // End by time - only when current player's time runs out
        if ((turn === "black" && next.black === 0) || (turn === "red" && next.red === 0)) {
          const loser = turn === "black" ? "Brown" : "Red";
          const winnerId = turn === "black" ? players[1] : players[0];
          if (!endedRef.current && winnerId) {
            endedRef.current = true;
            channelRef.current?.send({ type: "broadcast", event: "game_over", payload: { gameId, winnerId, stake } });
          }
          setGameOver(`${loser} ran out of time`);
          toast.error(`${loser} lost on time`);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [players, me.id, turn, gameOver]);

  const tryMove = (r: number, c: number) => {
    if (gameOver) return;
    if (!myColor || myColor !== turn) return;

    if (!selected) {
      // Select if it's my piece
      const piece = board[r][c];
      if (piece && piece.color === myColor) setSelected({ r, c });
      return;
    }

    // Attempt move: simple step or capture (kings supported, no forced captures)
    const from = selected;
    const piece = board[from.r][from.c];
    if (!piece) {
      setSelected(null);
      return;
    }

    const dr = r - from.r;
    const dc = c - from.c;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
    const destEmpty = board[r][c] === null;

    const isForwardForMan = piece.color === "black" ? dr === 1 : dr === -1;
    const isForwardForCapture = piece.color === "black" ? dr === 2 : dr === -2;

    let didMove = false;
    const nextBoard = board.map((row) => row.slice());

    // Simple diagonal step (1)
    const stepDirOk = piece.king ? absDr === 1 : (absDr === 1 && isForwardForMan);
    if (stepDirOk && absDc === 1 && destEmpty) {
      const moved: Exclude<Cell, null> = { color: piece.color, king: piece.king };
      nextBoard[r][c] = moved;
      nextBoard[from.r][from.c] = null;
      didMove = true;
    } else if (absDr === 2 && absDc === 2 && destEmpty) {
      // Capture: jump over opponent piece (2)
      const mr = from.r + dr / 2;
      const mc = from.c + dc / 2;
      const mid = board[mr][mc];
      const captureDirOk = piece.king ? true : isForwardForCapture;
      if (mid && mid.color !== piece.color && captureDirOk) {
        const moved: Exclude<Cell, null> = { color: piece.color, king: piece.king };
        nextBoard[r][c] = moved;
        nextBoard[from.r][from.c] = null;
        nextBoard[mr][mc] = null; // remove captured piece
        didMove = true;
      }
    }

    if (didMove) {
      // Promotion to king
      const moved = nextBoard[r][c] as Exclude<Cell, null>;
      if (!moved.king) {
        if ((moved.color === "black" && r === BOARD_SIZE - 1) || (moved.color === "red" && r === 0)) {
          moved.king = true;
        }
      }

      const nextTurn: Color = turn === "black" ? "red" : "black";

      // Switch turn and broadcast including clocks snapshot; reset next player's clock
      const nextClocks = { ...clocks, [nextTurn]: START_TIME } as { black: number; red: number };
      setBoard(nextBoard);
      setTurn(nextTurn);
      setSelected(null);

      // Win check: opponent has no pieces left
      const oppHasPieces = nextBoard.some((row) => row.some((cell) => cell?.color === nextTurn));
      if (!oppHasPieces) {
        const winnerColor = turn; // the player who just moved
        const winnerLabel = winnerColor === "black" ? "Brown" : "Red";
        const winnerId = winnerColor === "black" ? players[0] : players[1];
        if (!endedRef.current && winnerId) {
          endedRef.current = true;
          channelRef.current?.send({ type: "broadcast", event: "game_over", payload: { gameId, winnerId, stake } });
        }
        setGameOver(`${winnerLabel} wins by capture`);
        toast.success(`${winnerLabel} wins by capture`);
      }

      channelRef.current?.send({ type: "broadcast", event: "move", payload: { board: nextBoard, turn: nextTurn, clocks: nextClocks } });
    } else {
      // Invalid — just reset selection
      setSelected(null);
    }
  };

  const handleGameOver = async (winnerId: string, s: number) => {
    if (!gameId) return;
    // Idempotent per-user payout
    const payoutKey = `game_${gameId}_payout_${me.id}`;
    if (localStorage.getItem(payoutKey)) return;

    const total = Number((s * 2).toFixed(2));
    const companyCut = Number((total * 0.2).toFixed(2));
    const winnerAmount = Number((total * 0.8).toFixed(2));

    try {
      if (me.id === winnerId) {
        await (supabase as any).rpc("credit_balance", { amount: winnerAmount });
        await (supabase as any).rpc("increment_stat", { result: "win", stake: s });
        const companyKey = `company_recorded_${gameId}`;
        if (!localStorage.getItem(companyKey)) {
          await (supabase as any).rpc("record_company_earning", { amount: companyCut, source_game: gameId });
          localStorage.setItem(companyKey, "1");
        }
      } else if (me.id) {
        await (supabase as any).rpc("increment_stat", { result: "loss", stake: s });
      }
      localStorage.setItem(payoutKey, "1");
    } catch (e) {
      // noop, UI is best-effort here
    }
  };

  const handleLeave = () => {
    if (!players.length || !gameId) {
      navigate('/');
      return;
    }
    const confirmLeave = window.confirm('Are you sure? If you exit you will lose.');
    if (!confirmLeave) return;
    const winnerId = players[0] === me.id ? players[1] : players[0];
    if (winnerId && !endedRef.current) {
      endedRef.current = true;
      channelRef.current?.send({ type: 'broadcast', event: 'game_over', payload: { gameId, winnerId, stake } });
    }
    navigate('/');
  };

  const squareBg = (r: number, c: number) => {
    return (r + c) % 2 === 0 ? "bg-board-light hover:bg-board-light/80 shadow-sm" : "bg-board-dark hover:bg-board-dark/80 shadow-sm";
  };
  const pieceStyle = (color: Color) => (color === "black" ? "bg-piece-black" : "bg-piece-red");

  return (
    <AppLayout title={`Game ${gameId || ''}`}>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-6 items-start max-w-7xl mx-auto">
          {/* Black Player Info */}
          <div className={`glass-card p-6 rounded-xl border-2 transition-all duration-300 order-2 lg:order-1 ${
            turn === "black" && !gameOver ? 'border-accent shadow-lg shadow-accent/20' : 'border-border/50'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-4 h-4 bg-piece-black rounded-full border border-white/50"></div>
              <h3 className="font-bold text-lg text-piece-black">Brown Player</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {players[0] ? (players[0] === me.id ? `${me.email.split('@')[0]} (You)` : usernames[players[0]] || 'Player') : 'Waiting for player...'}
            </p>
            <div className={`p-4 rounded-lg transition-all duration-300 ${
              turn === "black" && !gameOver 
                ? "bg-accent/20 border-2 border-accent/50" 
                : "bg-secondary/30"
            }`}>
              <div className={`text-2xl font-mono font-bold text-center ${
                turn === "black" && clocks.black <= 30 && clocks.black > 0 ? "text-warning animate-pulse" : ""
              }`}>
                {formatTime(clocks.black)}
              </div>
              {turn === "black" && !gameOver && (
                <div className="text-center mt-2">
                  <span className="text-xs text-success font-medium px-2 py-1 bg-success/10 rounded-full animate-pulse">
                    Your Turn - Timer Running
                  </span>
                </div>
              )}
              {turn !== "black" && !gameOver && (
                <div className="text-center mt-2">
                  <span className="text-xs text-muted-foreground font-medium px-2 py-1 bg-muted/10 rounded-full">
                    Waiting
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Game Board */}
          <div className="flex flex-col items-center space-y-6 order-1 lg:order-2">
            <div className="glass-card p-4 rounded-xl">
              <div className="grid grid-cols-8 gap-1 p-2 bg-secondary/20 rounded-lg checkers-board mx-auto">
                {board.map((row, r) =>
                  row.map((cell, c) => (
                    <button
                      key={`${r}-${c}`}
                      className={`aspect-square ${squareBg(r, c)} flex items-center justify-center transition-all duration-200 relative ${
                        selected && selected.r === r && selected.c === c 
                          ? "ring-4 ring-primary shadow-lg scale-105" 
                          : "hover:scale-102"
                      } focus:outline-none focus:ring-2 focus:ring-primary/50`}
                      onClick={() => tryMove(r, c)}
                    >
                      {cell && (
                        <div
                          className={`w-[80%] h-[80%] rounded-full border-2 border-white/50 shadow-lg ${pieceStyle(cell.color)} ${
                            cell.king ? "shadow-xl ring-2 ring-warning/50" : "shadow-md"
                          } transition-all duration-200 hover:scale-110 flex items-center justify-center`}
                        >
                          {cell.king && (
                            <span className="text-warning text-lg font-bold drop-shadow-sm">♔</span>
                          )}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
            
            {gameOver ? (
              <div className="text-center space-y-4 glass-card p-6 rounded-xl">
                <h2 className="text-2xl font-bold text-primary">Game Over!</h2>
                <p className="text-muted-foreground">{gameOver}</p>
                <Button onClick={() => navigate('/')} className="kick-button">
                  Return to Lobby
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleLeave} className="kick-button-secondary">
                  Leave Game
                </Button>
              </div>
            )}
          </div>

          {/* Red Player Info */}
          <div className={`glass-card p-6 rounded-xl border-2 transition-all duration-300 order-3 ${
            turn === "red" && !gameOver ? 'border-accent shadow-lg shadow-accent/20' : 'border-border/50'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-4 h-4 bg-piece-red rounded-full"></div>
              <h3 className="font-bold text-lg text-piece-red">Red Player</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {players[1] ? (players[1] === me.id ? `${me.email.split('@')[0]} (You)` : usernames[players[1]] || 'Player') : 'Waiting for player...'}
            </p>
            <div className={`p-4 rounded-lg transition-all duration-300 ${
              turn === "red" && !gameOver 
                ? "bg-accent/20 border-2 border-accent/50" 
                : "bg-secondary/30"
            }`}>
              <div className={`text-2xl font-mono font-bold text-center ${
                turn === "red" && clocks.red <= 30 && clocks.red > 0 ? "text-warning animate-pulse" : ""
              }`}>
                {formatTime(clocks.red)}
              </div>
              {turn === "red" && !gameOver && (
                <div className="text-center mt-2">
                  <span className="text-xs text-success font-medium px-2 py-1 bg-success/10 rounded-full animate-pulse">
                    Your Turn - Timer Running
                  </span>
                </div>
              )}
              {turn !== "red" && !gameOver && (
                <div className="text-center mt-2">
                  <span className="text-xs text-muted-foreground font-medium px-2 py-1 bg-muted/10 rounded-full">
                    Waiting
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile-friendly game info */}
        <div className="lg:hidden mt-6 max-w-md mx-auto">
          <div className="glass-card p-4 rounded-xl">
            <h3 className="font-semibold text-center mb-3">Game Info</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-center">
                <p className="text-muted-foreground mb-1">Stake</p>
                <p className="font-bold text-success">{stake}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground mb-1">Players</p>
                <p className="font-bold">{players.length}/2</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
