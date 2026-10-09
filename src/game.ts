import { randomInt, randomUUID } from "node:crypto";
import {
  CARD_COLORS,
  type Card,
  type CardColor,
  type GameState,
  type PlayerView,
} from "./game-types";

type Player = {
  id: string;
  name: string;
  connected: boolean;
  saidUno: boolean;
};

type Room = {
  code: string;
  players: Player[];
  hostId: string;
  started: boolean;
  winnerId: string | null;
  hands: Map<string, Card[]>;
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  currentColor: CardColor | null;
  canPlayDrawnCardPlayerId: string | null;
};

export type GameError = "Room not found" | "Room is full" | "Game has already started"
  | "Game is not in progress" | "Only the host can start the game"
  | "At least two players are needed" | "It is not your turn"
  | "That card is not in your hand" | "That card cannot be played"
  | "Choose a color for a wild card" | "Draw a card before playing"
  | "You cannot end your turn yet" | "No cards are available to draw";

const MAX_PLAYERS = 8;

function createDeck(): Card[] {
  const cards: Card[] = [];
  const add = (color: Card["color"], value: string) => {
    cards.push({ id: randomUUID(), color, value });
  };

  for (const color of CARD_COLORS) {
    add(color, "0");
    for (const value of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"]) {
      add(color, value);
      add(color, value);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    add("wild", "wild");
    add("wild", "wild4");
  }
  return shuffle(cards);
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export class UnoGame {
  private readonly rooms = new Map<string, Room>();

  createRoom(playerId: string, name: string): Room {
    const code = this.newCode();
    const player: Player = { id: playerId, name: this.cleanName(name), connected: true, saidUno: false };
    const room: Room = {
      code,
      players: [player],
      hostId: playerId,
      started: false,
      winnerId: null,
      hands: new Map(),
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      direction: 1,
      currentColor: null,
      canPlayDrawnCardPlayerId: null,
    };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code: string, playerId: string, name: string): Room | GameError {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "Room not found";
    if (room.started) return "Game has already started";
    if (room.players.length >= MAX_PLAYERS) return "Room is full";
    room.players.push({ id: playerId, name: this.cleanName(name), connected: true, saidUno: false });
    return room;
  }

  start(room: Room, playerId: string): true | GameError {
    if (room.hostId !== playerId) return "Only the host can start the game";
    if (room.started && !room.winnerId) return "Game has already started";
    if (room.players.length < 2) return "At least two players are needed";

    room.deck = createDeck();
    room.hands.clear();
    for (const player of room.players) {
      room.hands.set(player.id, room.deck.splice(0, 7));
      player.saidUno = false;
    }
    const initialCardIndex = room.deck.findIndex((card) => card.color !== "wild" && !this.isAction(card));
    const [initialCard] = room.deck.splice(initialCardIndex, 1);
    room.discardPile = [initialCard];
    room.currentColor = initialCard.color as CardColor;
    room.currentPlayerIndex = 0;
    room.direction = 1;
    room.winnerId = null;
    room.canPlayDrawnCardPlayerId = null;
    room.started = true;
    return true;
  }

  play(room: Room, playerId: string, cardId: string, chosenColor?: CardColor): true | GameError {
    if (!room.started || room.winnerId) return "Game is not in progress";
    if (room.players[room.currentPlayerIndex]?.id !== playerId) return "It is not your turn";
    const hand = room.hands.get(playerId);
    const cardIndex = hand?.findIndex((card) => card.id === cardId) ?? -1;
    if (!hand || cardIndex < 0) return "That card is not in your hand";
    const card = hand[cardIndex];
    if (room.canPlayDrawnCardPlayerId && room.canPlayDrawnCardPlayerId !== playerId) return "Draw a card before playing";
    if (!this.isPlayable(card, room)) return "That card cannot be played";
    if (card.color === "wild" && (!chosenColor || !CARD_COLORS.includes(chosenColor))) {
      return "Choose a color for a wild card";
    }

    hand.splice(cardIndex, 1);
    room.discardPile.push(card);
    room.currentColor = card.color === "wild" ? chosenColor as CardColor : card.color;
    room.canPlayDrawnCardPlayerId = null;
    const player = room.players.find((item) => item.id === playerId);
    if (player) player.saidUno = hand.length === 1;

    if (hand.length === 0) {
      room.winnerId = playerId;
      return true;
    }
    this.applyCardEffect(room, card);
    return true;
  }

  draw(room: Room, playerId: string): true | GameError {
    if (!room.started || room.winnerId) return "Game is not in progress";
    if (room.players[room.currentPlayerIndex]?.id !== playerId) return "It is not your turn";
    if (room.canPlayDrawnCardPlayerId) return "You cannot end your turn yet";
    const card = this.takeCard(room);
    if (!card) return "No cards are available to draw";
    room.hands.get(playerId)?.push(card);
    const player = room.players.find((item) => item.id === playerId);
    if (player) player.saidUno = false;

    if (this.isPlayable(card, room)) {
      room.canPlayDrawnCardPlayerId = playerId;
    } else {
      this.advance(room);
    }
    return true;
  }

  endTurn(room: Room, playerId: string): true | GameError {
    if (!room.started || room.winnerId) return "Game is not in progress";
    if (room.players[room.currentPlayerIndex]?.id !== playerId) return "It is not your turn";
    if (room.canPlayDrawnCardPlayerId !== playerId) return "Draw a card before playing";
    room.canPlayDrawnCardPlayerId = null;
    this.advance(room);
    return true;
  }

  setConnected(room: Room, playerId: string, connected: boolean): void {
    const player = room.players.find((item) => item.id === playerId);
    if (player) player.connected = connected;
  }

  getHand(room: Room, playerId: string): Card[] {
    return [...(room.hands.get(playerId) ?? [])];
  }

  getState(room: Room): GameState {
    return {
      code: room.code,
      hostId: room.hostId,
      players: room.players.map((player): PlayerView => ({
        id: player.id,
        name: player.name,
        cardCount: room.hands.get(player.id)?.length ?? 0,
        connected: player.connected,
        saidUno: player.saidUno,
      })),
      started: room.started,
      topCard: room.discardPile.at(-1) ?? null,
      currentColor: room.currentColor,
      currentPlayerId: room.started ? room.players[room.currentPlayerIndex]?.id ?? null : null,
      direction: room.direction,
      winnerId: room.winnerId,
      canPlayDrawnCardPlayerId: room.canPlayDrawnCardPlayerId,
    };
  }

  removePlayer(room: Room, playerId: string): boolean {
    if (room.started) {
      this.setConnected(room, playerId, false);
      return false;
    }
    room.players = room.players.filter((player) => player.id !== playerId);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return true;
    }
    if (room.hostId === playerId) room.hostId = room.players[0].id;
    return false;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  private cleanName(name: string): string {
    return name.trim().replace(/\s+/g, " ").slice(0, 18) || "Player";
  }

  private newCode(): string {
    let code: string;
    do {
      code = randomInt(0, 36 ** 5).toString(36).toUpperCase().padStart(5, "0");
    } while (this.rooms.has(code));
    return code;
  }

  private isAction(card: Card): boolean {
    return ["skip", "reverse", "draw2"].includes(card.value);
  }

  private isPlayable(card: Card, room: Room): boolean {
    const topCard = room.discardPile.at(-1);
    return card.color === "wild" || card.color === room.currentColor || card.value === topCard?.value;
  }

  private takeCard(room: Room): Card | null {
    if (room.deck.length === 0) {
      const topCard = room.discardPile.pop();
      if (topCard) room.deck = shuffle(room.discardPile.splice(0));
      if (topCard) room.discardPile.push(topCard);
    }
    return room.deck.pop() ?? null;
  }

  private advance(room: Room, steps = 1): void {
    const count = room.players.length;
    room.currentPlayerIndex = (room.currentPlayerIndex + room.direction * steps + count * steps) % count;
    room.canPlayDrawnCardPlayerId = null;
  }

  private applyCardEffect(room: Room, card: Card): void {
    const playerCount = room.players.length;
    if (card.value === "reverse") {
      room.direction = room.direction === 1 ? -1 : 1;
      this.advance(room, playerCount === 2 ? 2 : 1);
    } else if (card.value === "skip") {
      this.advance(room, 2);
    } else if (card.value === "draw2" || card.value === "wild4") {
      const nextIndex = (room.currentPlayerIndex + room.direction + playerCount) % playerCount;
      const nextPlayer = room.players[nextIndex];
      for (let i = 0; i < (card.value === "draw2" ? 2 : 4); i += 1) {
        const drawnCard = this.takeCard(room);
        if (!drawnCard) break;
        room.hands.get(nextPlayer.id)?.push(drawnCard);
      }
      nextPlayer.saidUno = false;
      this.advance(room, 2);
    } else {
      this.advance(room);
    }
  }
}
