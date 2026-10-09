import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { UnoGame, type GameError } from "./game";
import type { ActionResult, CardColor } from "./game-types";

const app = express();
const configuredOrigins = (process.env.FRONTEND_ORIGIN ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = configuredOrigins.length === 1 && configuredOrigins[0] === "*" ? "*" : configuredOrigins;
app.use(cors({ origin: corsOrigin }));
app.get("/api/health", (_request, response) => response.json({ status: "ok", game: "UNO" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
  connectionStateRecovery: { maxDisconnectionDuration: 120_000, skipMiddlewares: true },
});
const game = new UnoGame();
const playerRooms = new Map<string, string>();

function sendRoomState(code: string): void {
  const room = game.getRoom(code);
  if (!room) return;
  io.to(code).emit("room:update", game.getState(room));
  for (const player of room.players) {
    io.to(player.id).emit("hand:update", game.getHand(room, player.id));
  }
}

function reportError(callback: ((result: ActionResult) => void) | undefined, error: GameError): void {
  callback?.({ ok: false, error });
}

io.on("connection", (socket) => {
  if (socket.recovered) {
    const code = playerRooms.get(socket.id) ?? socket.data.roomCode;
    const room = code ? game.getRoom(code) : undefined;
    if (room && code) {
      playerRooms.set(socket.id, code);
      game.setConnected(room, socket.id, true);
      sendRoomState(code);
    }
  }

  socket.on("room:create", (payload: { name?: string }, callback?: (result: ActionResult) => void) => {
    const room = game.createRoom(socket.id, payload?.name ?? "");
    socket.data.playerId = socket.id;
    socket.data.roomCode = room.code;
    playerRooms.set(socket.id, room.code);
    void socket.join(room.code);
    callback?.({ ok: true, code: room.code });
    sendRoomState(room.code);
  });

  socket.on("room:join", (payload: { code?: string; name?: string }, callback?: (result: ActionResult) => void) => {
    const code = payload?.code?.trim().toUpperCase() ?? "";
    const result = game.joinRoom(code, socket.id, payload?.name ?? "");
    if (typeof result === "string") {
      reportError(callback, result);
      return;
    }
    socket.data.playerId = socket.id;
    socket.data.roomCode = code;
    playerRooms.set(socket.id, code);
    void socket.join(code);
    callback?.({ ok: true, code });
    sendRoomState(code);
  });

  socket.on("game:start", (callback?: (result: ActionResult) => void) => {
    const code = playerRooms.get(socket.id);
    const room = code ? game.getRoom(code) : undefined;
    if (!room || !code) {
      reportError(callback, "Room not found");
      return;
    }
    const result = game.start(room, socket.id);
    if (result !== true) {
      reportError(callback, result);
      return;
    }
    callback?.({ ok: true, code });
    sendRoomState(code);
  });

  socket.on(
    "game:play",
    (payload: { cardId?: string; color?: CardColor }, callback?: (result: ActionResult) => void) => {
      const code = playerRooms.get(socket.id);
      const room = code ? game.getRoom(code) : undefined;
      if (!room || !code) {
        reportError(callback, "Room not found");
        return;
      }
      const result = game.play(room, socket.id, payload?.cardId ?? "", payload?.color);
      if (result !== true) {
        reportError(callback, result);
        return;
      }
      callback?.({ ok: true });
      sendRoomState(code);
    },
  );

  socket.on("game:draw", (callback?: (result: ActionResult) => void) => {
    const code = playerRooms.get(socket.id);
    const room = code ? game.getRoom(code) : undefined;
    if (!room || !code) {
      reportError(callback, "Room not found");
      return;
    }
    const result = game.draw(room, socket.id);
    if (result !== true) {
      reportError(callback, result);
      return;
    }
    callback?.({ ok: true });
    sendRoomState(code);
  });

  socket.on("game:end-turn", (callback?: (result: ActionResult) => void) => {
    const code = playerRooms.get(socket.id);
    const room = code ? game.getRoom(code) : undefined;
    if (!room || !code) {
      reportError(callback, "Room not found");
      return;
    }
    const result = game.endTurn(room, socket.id);
    if (result !== true) {
      reportError(callback, result);
      return;
    }
    callback?.({ ok: true });
    sendRoomState(code);
  });

  socket.on("disconnect", () => {
    const code = playerRooms.get(socket.id);
    const room = code ? game.getRoom(code) : undefined;
    if (!room || !code) return;
    const roomDeleted = game.removePlayer(room, socket.id);
    playerRooms.delete(socket.id);
    if (roomDeleted) io.to(code).emit("room:closed");
    else sendRoomState(code);
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`UNO server listening on http://localhost:${port}`);
});
