import assert from "node:assert/strict";
import test from "node:test";
import { UnoGame } from "./game";

test("creates private rooms and assigns a host", () => {
  const game = new UnoGame();
  const room = game.createRoom("host", "  Ada  ");
  assert.equal(room.players[0].name, "Ada");
  assert.equal(game.getState(room).hostId, "host");
  assert.equal(game.getState(room).started, false);
  assert.equal(game.getState(room).players[0].cardCount, 0);
});

test("requires two players and allows only the host to start", () => {
  const game = new UnoGame();
  const room = game.createRoom("host", "Ada");
  assert.equal(game.start(room, "host"), "At least two players are needed");
  game.joinRoom(room.code, "guest", "Lin");
  assert.equal(game.start(room, "guest"), "Only the host can start the game");
  assert.equal(game.start(room, "host"), true);
  assert.equal(game.getHand(room, "host").length, 7);
  assert.equal(game.getHand(room, "guest").length, 7);
  assert.ok(game.getState(room).topCard);
});

test("rejects out-of-turn or forged card plays", () => {
  const game = new UnoGame();
  const room = game.createRoom("host", "Ada");
  game.joinRoom(room.code, "guest", "Lin");
  game.start(room, "host");
  assert.equal(game.play(room, "guest", "not-a-real-card"), "It is not your turn");
  assert.equal(game.play(room, "host", "not-a-real-card"), "That card is not in your hand");
  assert.equal(game.draw(room, "guest"), "It is not your turn");
});

test("restarts a completed round while preserving the room and host", () => {
  const game = new UnoGame();
  const room = game.createRoom("host", "Ada");
  game.joinRoom(room.code, "guest", "Lin");
  game.start(room, "host");
  room.winnerId = "guest";
  assert.equal(game.start(room, "host"), true);
  assert.equal(game.getState(room).winnerId, null);
  assert.equal(game.getState(room).started, true);
  assert.equal(game.getHand(room, "host").length, 7);
});

test("does not expose private hands in the public state", () => {
  const game = new UnoGame();
  const room = game.createRoom("host", "Ada");
  game.joinRoom(room.code, "guest", "Lin");
  game.start(room, "host");
  const state = game.getState(room) as unknown as Record<string, unknown>;
  assert.equal("hands" in state, false);
  assert.equal(state.players instanceof Array, true);
});

test("reports an exhausted deck without crashing the server", () => {
  const game = new UnoGame();
  const room = game.createRoom("host", "Ada");
  game.joinRoom(room.code, "guest", "Lin");
  game.start(room, "host");
  room.deck = [];
  room.discardPile = room.discardPile.slice(-1);
  assert.equal(game.draw(room, "host"), "No cards are available to draw");
});
