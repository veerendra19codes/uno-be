# UNO Online — Backend

Standalone Express and Socket.IO server for real-time UNO rooms. This project owns the deck, game rules, turns, and player hands. Game rooms are kept in process memory.

## Local development

```sh
npm ci
npm run dev
```

The API and Socket.IO server listen on port `3001` by default. Check `/api/health` to verify the server is running. `PORT` is read from the deployment environment.

## Deploy separately

Deploy this folder as the backend repository/root directory. Set:

- `FRONTEND_ORIGIN` to the public frontend origin, such as `https://your-game.example.com`. Multiple comma-separated origins are supported. It defaults to `*` for local development.
- `PORT` if your host does not provide it automatically.

The frontend must be built with `VITE_SERVER_URL` set to this server's public URL. Socket.IO connections require a host that supports WebSockets and persistent in-memory processes. Use one backend instance: rooms currently live in memory and are not shared between multiple instances or preserved when the server restarts.

## Build and run

```sh
npm ci
npm test
npm run build
npm start
```
