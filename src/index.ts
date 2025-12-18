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
  createGameVersion,
  deleteGameVersion,
  getGameVersionById,
  updateGameVersion,
} from "./controllers/game_version";
import path from "path";
import { upload } from "./middlewares/upload.middleware";
import {
  publishGame,
  getAllPublishedGames,
} from "./controllers/publish.controller";
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

app.get("/api/game-version/:id", getGameVersionById);

app.post("/api/game-version", createGameVersion);
app.put("/api/game-version/:id", updateGameVersion);
app.delete("/api/game-version/:id", deleteGameVersion);
app.use("/storage", express.static(path.join(process.cwd(), "storage")));

// --- New Published Games Routes ---

// Get all games (Public)
app.get("/api/published-games", getAllPublishedGames);

// Publish a new game (Multipart Form Data)
// We use .fields() to accept two different file inputs from the frontend
app.post(
  "/api/published-games",
  authenticateJWT,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "gameFile", maxCount: 1 },
  ]),
  publishGame
);
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
