import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { initTables } from "./db/initController";
import { authenticateJWT, refreshToken } from "./middlewares/auth.middleware";
import {
  loginOrCreateUser,
  verifyLauncherToken,
  createUser,
  getUsers,
  getUserDetail,
  updateUser,
  deleteUser,
  updateCoins,
} from "./controllers/auth.controller";

import {
  createGame,
  getGames,
  getGame,
  updateGame,
  deleteGame,
} from "./controllers/game.controller";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
// Increase JSON & URL-encoded body limit to 100MB
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const PORT = process.env.PORT || 3000;

// Init tables on startup
initTables();

// Public routes
app.post("/api/users/login-or-create", loginOrCreateUser);
app.post("/api/users/verify-launcher", verifyLauncherToken);
app.post("/api/token/refresh", refreshToken);
app.get("/api/users", getUsers);
app.get("/api/users/:id", authenticateJWT, getUserDetail);

// Protected routes
app.post("/api/users", authenticateJWT, createUser);
app.put("/api/users/:id", authenticateJWT, updateUser);
app.put("/api/users/:id/coins", authenticateJWT, updateCoins);
app.delete("/api/users/:id", authenticateJWT, deleteUser);

// Public APIs
app.get("/api/games", getGames);
app.get("/api/games/:id", getGame);

// Protected APIs (require JWT)
app.post("/api/games", createGame);
app.put("/api/games/:id", updateGame);
app.delete("/api/games/:id", deleteGame);

app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
