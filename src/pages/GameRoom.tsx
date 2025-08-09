import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Color = "black" | "red";

type Cell = { color: Color; king?: boolean } | null;

type Board = Cell[][]; // 8x8

const BOARD_SIZE = 8;
const START_TIME = 300; // 5 minutes in seconds

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

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<string[]>([]); // user ids
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [board, setBoard] = useState<Board>(() => createInitialBoard());
  const [turn, setTurn] = useState<Color>("black");
  const [clocks, setClocks] = useState<{ black: number; red: number }>({ black: START_TIME, red: START_TIME });
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [gameOver, setGameOver] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const me = useMemo(() => ({ id: session?.user.id ?? "", email: session?.user.email ?? "" }), [session]);

  // SEO basics
  useEffect(() => {
    document.title = "Checkers Game | 5-min Timer";
    const description = "Play a 5-minute checkers match with realtime sync.";
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/auth", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Setup channel
  useEffect(() => {
    if (!gameId || !me.id) return;
    const channel = supabase.channel(`game-${gameId}`, { config: { presence: { key: me.id } } });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ email: string }>>;
        const ids = Object.keys(state).sort();
        setPlayers(ids);
        if (ids.length >= 2) {
          const myIdx = ids.indexOf(me.id);
          // player[0] => black, player[1] => red
          setMyColor(myIdx === 0 ? "black" : myIdx === 1 ? "red" : null);
        }
      })
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: me.email });
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [gameId, me]);

  // Host clock tick (player[0])
  useEffect(() => {
    if (!players.length) return;
    const isHost = players[0] === me.id;
    if (!isHost || gameOver) return;

    const interval = setInterval(() => {
      setClocks((prev) => {
        const next = { ...prev };
        if (turn === "black") next.black = Math.max(0, prev.black - 1);
        else next.red = Math.max(0, prev.red - 1);

        // Broadcast tick
        channelRef.current?.send({ type: "broadcast", event: "tick", payload: { clocks: next, turn } });

        // End by time
        if (next.black === 0 || next.red === 0) {
          const loser = next.black === 0 ? "Black" : "Red";
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

    // Attempt simple diagonal step (no captures, no kings for MVP)
    const from = selected;
    const piece = board[from.r][from.c];
    if (!piece) {
      setSelected(null);
      return;
    }

    const dr = r - from.r;
    const dc = c - from.c;
    const isDiag = Math.abs(dr) === 1 && Math.abs(dc) === 1;
    const forwardOk = piece.color === "black" ? dr === 1 : dr === -1;
    if (isDiag && forwardOk && board[r][c] === null) {
      const nextBoard = board.map((row) => row.slice());
      nextBoard[r][c] = piece;
      nextBoard[from.r][from.c] = null;
      const nextTurn: Color = turn === "black" ? "red" : "black";

      // Switch turn and broadcast including clocks snapshot
      const nextClocks = { ...clocks };
      setBoard(nextBoard);
      setTurn(nextTurn);
      setSelected(null);

      channelRef.current?.send({ type: "broadcast", event: "move", payload: { board: nextBoard, turn: nextTurn, clocks: nextClocks } });
    } else {
      // Invalid — just reset selection
      setSelected(null);
    }
  };

  const squareBg = (r: number, c: number) => ((r + c) % 2 === 0 ? "bg-background" : "bg-accent");
  const pieceStyle = (color: Color) => (color === "black" ? "bg-primary" : "bg-secondary");

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <section className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Checkers Game</h1>
            <p className="text-muted-foreground">Game ID: {gameId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate("/")}>Back to Lobby</Button>
          </div>
        </header>

        <div className="flex flex-col md:flex-row gap-8">
          <article className="flex-1">
            <div className="grid grid-cols-8 gap-1 max-w-[min(90vw,512px)] aspect-square">
              {board.map((row, r) => (
                <div key={r} className="contents">
                  {row.map((cell, c) => (
                    <button
                      key={`${r}-${c}`}
                      className={`${squareBg(r, c)} relative aspect-square rounded-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring`}
                      onClick={() => tryMove(r, c)}
                    >
                      {cell && (
                        <span
                          className={`${pieceStyle(cell.color)} absolute inset-2 rounded-full shadow`}
                          aria-label={`${cell.color} piece`}
                        />
                      )}
                      {selected && selected.r === r && selected.c === c && (
                        <span className="absolute inset-1 rounded-sm ring-2 ring-ring" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </article>

          <aside className="w-full md:w-72 space-y-4">
            <div className="rounded-lg border border-border p-4 bg-card/50">
              <h2 className="font-semibold mb-2">Players</h2>
              <ul className="text-sm text-muted-foreground space-y-1">
                {players.map((id, idx) => (
                  <li key={id}>
                    {idx === 0 ? "Black" : idx === 1 ? "Red" : "Spectator"}: {id === me.id ? `${me.email} (You)` : id}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border p-4 bg-card/50">
              <h2 className="font-semibold mb-2">Clocks (5 min)</h2>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${turn === "black" ? "font-bold" : ""}`}>Black</span>
                <span className="font-mono">{formatTime(clocks.black)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${turn === "red" ? "font-bold" : ""}`}>Red</span>
                <span className="font-mono">{formatTime(clocks.red)}</span>
              </div>
            </div>

            {gameOver && (
              <div className="rounded-lg border border-border p-4 bg-card/50">
                <p className="font-semibold">{gameOver}</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
