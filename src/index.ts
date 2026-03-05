import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";

import { initTables } from "./db/initController";
import {
  authenticateJWT,
  optionalAuthJWT,
  refreshToken,
} from "./middlewares/auth.middleware";
import { upload } from "./middlewares/upload.middleware";

// ── Controllers ──
import {
  loginOrCreateUser,
  verifyLauncherToken,
  createUser,
  getUsers,
  getUserDetail,
  updateUser,
  deleteUser,
  updateCoins,
  getMe,
} from "./controllers/auth.controller";

import {
  connectWallet,
  getMyWallets,
  disconnectWallet,
  setPrimaryWallet,
  updateWalletLabel,
  getWalletsByUserId,
} from "./controllers/wallet.controller";

import {
  createGameVersion,
  deleteGameVersion,
  getGameVersionById,
  updateGameVersion,
} from "./controllers/game_version";

import {
  publishGame,
  getAllPublishedGames,
  getMyPublishedGames,
  incrementView,
  incrementInstall,
  getGameById,
  updatePublishedGame,
  deletePublishedGame,
} from "./controllers/publish.controller";

import {
  loginAdmin,
  createAdmin,
  getAdminProfile,
} from "./controllers/admin.controller";
import { authenticateToken } from "./middlewares/admin.middleware";

import {
  getUserStats,
  getAdminUsers,
  getAdminUserById,
  deleteAdminUser,
  updateAdminUserCoins,
  updateAdminUserRole,
} from "./controllers/admin.users.controller";

// ────────────────────────────────────────────────────
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// ── Static Storage ──
app.use("/storage", express.static(path.join(process.cwd(), "storage")));

// ════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════

// Public
app.post("/api/auth/login", loginOrCreateUser); // Email login / register
app.post("/api/auth/verify-launcher", verifyLauncherToken); // Game launcher redirect login
app.post("/api/token/refresh", refreshToken); // Refresh JWT

// Legacy support (keep old route working during migration)
app.post("/api/users/login-or-create", loginOrCreateUser);
app.post("/api/users/verify-launcher", verifyLauncherToken);

// ════════════════════════════════════════════════════
//  USER ROUTES
// ════════════════════════════════════════════════════

app.get("/api/users/me", authenticateJWT, getMe); // Get current logged-in user
app.get("/api/users", getUsers); // List all users (public)
app.get("/api/users/:id", authenticateJWT, getUserDetail); // Get user by ID

app.post("/api/users", authenticateJWT, createUser); // Create user (admin use)
app.put("/api/users/:id", authenticateJWT, updateUser); // Update user
app.put("/api/users/:id/coins", authenticateJWT, updateCoins); // Update coins
app.delete("/api/users/:id", authenticateJWT, deleteUser); // Delete user

// ════════════════════════════════════════════════════
//  WALLET ROUTES  (all protected — must be logged in)
// ════════════════════════════════════════════════════

// POST   /api/wallets/connect              → connect a wallet to account
// GET    /api/wallets/my-wallets           → list my connected wallets
// DELETE /api/wallets/:walletId            → disconnect a wallet
// PATCH  /api/wallets/:walletId/primary    → set as primary wallet
// PATCH  /api/wallets/:walletId/label      → rename a wallet
// GET    /api/wallets/user/:userId         → get wallets by user (admin)

app.post("/api/wallets/connect", authenticateJWT, connectWallet);
app.get("/api/wallets/my-wallets", authenticateJWT, getMyWallets);
app.delete("/api/wallets/:walletId", authenticateJWT, disconnectWallet);
app.patch("/api/wallets/:walletId/primary", authenticateJWT, setPrimaryWallet);
app.patch("/api/wallets/:walletId/label", authenticateJWT, updateWalletLabel);
app.get("/api/wallets/user/:userId", authenticateJWT, getWalletsByUserId); // admin use

// ════════════════════════════════════════════════════
//  GAME VERSION ROUTES
// ════════════════════════════════════════════════════

app.get("/api/game-version/:id", getGameVersionById);
app.post("/api/game-version", createGameVersion);
app.put("/api/game-version/:id", updateGameVersion);
app.delete("/api/game-version/:id", deleteGameVersion);

// ════════════════════════════════════════════════════
//  PUBLISHED GAMES ROUTES
// ════════════════════════════════════════════════════

app.get("/api/published-games", optionalAuthJWT, getAllPublishedGames); // Public with optional auth
app.get("/api/published-games/my-games", authenticateJWT, getMyPublishedGames);
app.get("/api/published-games/:id", authenticateJWT, getGameById);

// Add this alongside the existing routes (same multer middleware as POST):
app.put(
  "/api/published-games/:id",
  authenticateJWT,
  upload.fields([{ name: "thumbnail", maxCount: 1 }]),
  updatePublishedGame,
);

app.delete("/api/published-games/:id", authenticateJWT, deletePublishedGame); // Reuse published game delete for now (can be separated later if needed)
app.post(
  "/api/published-games",
  authenticateJWT,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "gameFile", maxCount: 1 },
  ]),
  publishGame,
);

app.put("/api/published-games/:id/view", authenticateJWT, incrementView);
app.put("/api/published-games/:id/install", authenticateJWT, incrementInstall);

// ════════════════════════════════════════════════════
//  ADMIN ROUTES
// ════════════════════════════════════════════════════

app.post("/api/v1/admin/register", createAdmin);
app.post("/api/v1/admin/login", loginAdmin);
app.get("/api/v1/admin/me", authenticateToken, getAdminProfile);

// ⚠️  /stats MUST be registered BEFORE /:id — otherwise Express
//     will match "stats" as the :id param.
app.get("/api/v1/admin/users/stats", authenticateToken, getUserStats);
app.get("/api/v1/admin/users", authenticateToken, getAdminUsers);
app.get("/api/v1/admin/users/:id", authenticateToken, getAdminUserById);
app.delete("/api/v1/admin/users/:id", authenticateToken, deleteAdminUser);
app.patch(
  "/api/v1/admin/users/:id/coins",
  authenticateToken,
  updateAdminUserCoins,
);
app.patch(
  "/api/v1/admin/users/:id/role",
  authenticateToken,
  updateAdminUserRole,
);
// ════════════════════════════════════════════════════
//  HEALTH CHECK
// ════════════════════════════════════════════════════

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ────────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`),
);
