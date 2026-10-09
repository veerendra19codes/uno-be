export const CARD_COLORS = ["red", "yellow", "green", "blue"] as const;

export type CardColor = (typeof CARD_COLORS)[number];
export type Card = {
  id: string;
  color: CardColor | "wild";
  value: string;
};

export type PlayerView = {
  id: string;
  name: string;
  cardCount: number;
  connected: boolean;
  saidUno: boolean;
};

export type GameState = {
  code: string;
  hostId: string;
  players: PlayerView[];
  started: boolean;
  topCard: Card | null;
  currentColor: CardColor | null;
  currentPlayerId: string | null;
  direction: 1 | -1;
  winnerId: string | null;
  canPlayDrawnCardPlayerId: string | null;
};

export type ActionResult = {
  ok: boolean;
  error?: string;
  code?: string;
};
