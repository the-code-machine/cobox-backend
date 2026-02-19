import { pool } from "../db/db";

const SEPOLIA_CHAIN_ID = 11155111;

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/wallets/connect
//  Connect a wallet to the logged-in user. Enforces Sepolia only.
// ─────────────────────────────────────────────────────────────────────────────
export const connectWallet = async (req: any, res: any) => {
  const userId = req.userId;
  const { wallet_address, wallet_type, chain_id, label } = req.body;

  if (!wallet_address?.trim()) {
    return res.status(400).json({ error: "wallet_address is required" });
  }

  // Enforce Sepolia only
  if (chain_id && Number(chain_id) !== SEPOLIA_CHAIN_ID) {
    return res.status(403).json({
      error: `Only Sepolia Testnet (chain ID ${SEPOLIA_CHAIN_ID}) is allowed.`,
    });
  }

  const normalizedAddr = wallet_address.toLowerCase().trim();

  try {
    // Check if wallet already exists anywhere
    const existing = await pool.query(
      `SELECT * FROM user_wallets WHERE wallet_address = $1`,
      [normalizedAddr],
    );

    if (existing.rows[0]) {
      if (existing.rows[0].user_id === userId) {
        // Same user reconnecting — mark as connected
        const updated = await pool.query(
          `UPDATE user_wallets
           SET is_connected = true, connected_at = CURRENT_TIMESTAMP
           WHERE wallet_address = $1
           RETURNING *`,
          [normalizedAddr],
        );
        return res.json({
          success: true,
          message: "Wallet reconnected",
          wallet: updated.rows[0],
        });
      }
      return res.status(409).json({
        error: "This wallet is already connected to another account",
      });
    }

    // First wallet for this user? Make it primary
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM user_wallets WHERE user_id = $1`,
      [userId],
    );
    const isPrimary = parseInt(countRes.rows[0].count) === 0;

    // Disconnect all other wallets' is_connected flag (only one active at a time)
    await pool.query(
      `UPDATE user_wallets SET is_connected = false WHERE user_id = $1`,
      [userId],
    );

    const result = await pool.query(
      `INSERT INTO user_wallets
         (user_id, wallet_address, wallet_type, chain_id, label, is_primary, is_connected)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [
        userId,
        normalizedAddr,
        wallet_type || "metamask",
        chain_id ? Number(chain_id) : SEPOLIA_CHAIN_ID,
        label?.trim() || null,
        isPrimary,
      ],
    );

    return res.status(201).json({
      success: true,
      message: isPrimary
        ? "Wallet connected and set as primary"
        : "Wallet connected",
      wallet: result.rows[0],
    });
  } catch (err: any) {
    console.error("connectWallet error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/wallets/my-wallets
//  All wallets for the logged-in user
// ─────────────────────────────────────────────────────────────────────────────
export const getMyWallets = async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT * FROM user_wallets
       WHERE user_id = $1
       ORDER BY is_primary DESC, connected_at ASC`,
      [req.userId],
    );
    return res.json({ success: true, wallets: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/wallets/:walletId
//  Remove a wallet. Auto-promotes next wallet to primary if needed.
// ─────────────────────────────────────────────────────────────────────────────
export const disconnectWallet = async (req: any, res: any) => {
  const { walletId } = req.params;

  try {
    const walletRes = await pool.query(
      `SELECT * FROM user_wallets WHERE id = $1 AND user_id = $2`,
      [walletId, req.userId],
    );

    if (!walletRes.rows[0]) {
      return res.status(404).json({ error: "Wallet not found or not yours" });
    }

    const wallet = walletRes.rows[0];
    await pool.query(`DELETE FROM user_wallets WHERE id = $1`, [walletId]);

    // Auto-promote next wallet to primary if we deleted the primary
    if (wallet.is_primary) {
      await pool.query(
        `UPDATE user_wallets
         SET is_primary = true
         WHERE id = (
           SELECT id FROM user_wallets
           WHERE user_id = $1
           ORDER BY connected_at ASC
           LIMIT 1
         )`,
        [req.userId],
      );
    }

    return res.json({ success: true, message: "Wallet removed" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/wallets/:walletId/disconnect-session
//  Just marks wallet as not connected (soft disconnect — keeps record)
// ─────────────────────────────────────────────────────────────────────────────
export const disconnectSession = async (req: any, res: any) => {
  const { walletId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE user_wallets SET is_connected = false
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [walletId, req.userId],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "Wallet not found" });
    return res.json({ success: true, wallet: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/wallets/:walletId/primary
// ─────────────────────────────────────────────────────────────────────────────
export const setPrimaryWallet = async (req: any, res: any) => {
  const { walletId } = req.params;
  try {
    const check = await pool.query(
      `SELECT * FROM user_wallets WHERE id = $1 AND user_id = $2`,
      [walletId, req.userId],
    );
    if (!check.rows[0])
      return res.status(404).json({ error: "Wallet not found" });

    await pool.query(
      `UPDATE user_wallets SET is_primary = false WHERE user_id = $1`,
      [req.userId],
    );
    const result = await pool.query(
      `UPDATE user_wallets SET is_primary = true WHERE id = $1 RETURNING *`,
      [walletId],
    );
    return res.json({ success: true, wallet: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/wallets/:walletId/label
// ─────────────────────────────────────────────────────────────────────────────
export const updateWalletLabel = async (req: any, res: any) => {
  const { walletId } = req.params;
  const { label } = req.body;
  if (!label?.trim())
    return res.status(400).json({ error: "Label is required" });

  try {
    const result = await pool.query(
      `UPDATE user_wallets SET label = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [label.trim(), walletId, req.userId],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "Wallet not found" });
    return res.json({ success: true, wallet: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/wallets/user/:userId  (admin)
// ─────────────────────────────────────────────────────────────────────────────
export const getWalletsByUserId = async (req: any, res: any) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM user_wallets WHERE user_id = $1 ORDER BY is_primary DESC`,
      [userId],
    );
    return res.json({ success: true, wallets: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
