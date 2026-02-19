import { pool } from "../db/db";

// ─────────────────────────────────────────────
//  CONNECT A WALLET  (link wallet to logged-in user)
//  POST /api/wallets/connect
// ─────────────────────────────────────────────
export const connectWallet = async (req: any, res: any) => {
  const userId = req.userId;
  const { wallet_address, wallet_type, chain_id, label } = req.body;

  if (!wallet_address || !wallet_address.trim()) {
    return res.status(400).json({ error: "wallet_address is required" });
  }

  try {
    // Check if this wallet is already connected to ANY user
    const existing = await pool.query(
      `SELECT * FROM user_wallets WHERE wallet_address = $1`,
      [wallet_address.toLowerCase()],
    );

    if (existing.rows[0]) {
      // If it belongs to the same user — just return it (idempotent)
      if (existing.rows[0].user_id === userId) {
        return res.json({
          success: true,
          message: "Wallet already connected",
          wallet: existing.rows[0],
        });
      }
      // If it belongs to a different user — reject
      return res.status(409).json({
        error: "This wallet is already connected to another account",
      });
    }

    // Check how many wallets this user already has
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM user_wallets WHERE user_id = $1`,
      [userId],
    );
    const walletCount = parseInt(countRes.rows[0].count);

    // First wallet auto becomes primary
    const isPrimary = walletCount === 0;

    const result = await pool.query(
      `INSERT INTO user_wallets (user_id, wallet_address, wallet_type, chain_id, label, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        wallet_address.toLowerCase().trim(),
        wallet_type || "unknown",
        chain_id || null,
        label?.trim() || null,
        isPrimary,
      ],
    );

    return res.status(201).json({
      success: true,
      message: isPrimary
        ? "Wallet connected and set as primary"
        : "Wallet connected successfully",
      wallet: result.rows[0],
    });
  } catch (err: any) {
    console.error("Error in connectWallet:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  GET MY WALLETS  (all wallets for logged-in user)
//  GET /api/wallets/my-wallets
// ─────────────────────────────────────────────
export const getMyWallets = async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT * FROM user_wallets WHERE user_id = $1 ORDER BY is_primary DESC, connected_at ASC`,
      [req.userId],
    );
    return res.json({ success: true, wallets: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  DISCONNECT / REMOVE A WALLET
//  DELETE /api/wallets/:walletId
// ─────────────────────────────────────────────
export const disconnectWallet = async (req: any, res: any) => {
  const userId = req.userId;
  const { walletId } = req.params;

  try {
    // Make sure wallet belongs to this user
    const walletRes = await pool.query(
      `SELECT * FROM user_wallets WHERE id = $1 AND user_id = $2`,
      [walletId, userId],
    );

    if (!walletRes.rows[0]) {
      return res.status(404).json({ error: "Wallet not found or not yours" });
    }

    const wallet = walletRes.rows[0];

    await pool.query(`DELETE FROM user_wallets WHERE id = $1`, [walletId]);

    // If we deleted the primary wallet, auto-assign next wallet as primary
    if (wallet.is_primary) {
      await pool.query(
        `UPDATE user_wallets
         SET is_primary = true
         WHERE user_id = $1
         ORDER BY connected_at ASC
         LIMIT 1`,
        [userId],
      );
    }

    return res.json({ success: true, message: "Wallet disconnected" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  SET PRIMARY WALLET
//  PATCH /api/wallets/:walletId/primary
// ─────────────────────────────────────────────
export const setPrimaryWallet = async (req: any, res: any) => {
  const userId = req.userId;
  const { walletId } = req.params;

  try {
    // Confirm wallet belongs to user
    const walletRes = await pool.query(
      `SELECT * FROM user_wallets WHERE id = $1 AND user_id = $2`,
      [walletId, userId],
    );

    if (!walletRes.rows[0]) {
      return res.status(404).json({ error: "Wallet not found or not yours" });
    }

    // Unset all primary for this user first
    await pool.query(
      `UPDATE user_wallets SET is_primary = false WHERE user_id = $1`,
      [userId],
    );

    // Set new primary
    const result = await pool.query(
      `UPDATE user_wallets SET is_primary = true WHERE id = $1 RETURNING *`,
      [walletId],
    );

    return res.json({
      success: true,
      message: "Primary wallet updated",
      wallet: result.rows[0],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  UPDATE WALLET LABEL
//  PATCH /api/wallets/:walletId/label
// ─────────────────────────────────────────────
export const updateWalletLabel = async (req: any, res: any) => {
  const userId = req.userId;
  const { walletId } = req.params;
  const { label } = req.body;

  if (!label?.trim()) {
    return res.status(400).json({ error: "Label is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE user_wallets SET label = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [label.trim(), walletId, userId],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Wallet not found or not yours" });
    }

    return res.json({ success: true, wallet: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  GET WALLETS BY USER ID (Admin use)
//  GET /api/wallets/user/:userId
// ─────────────────────────────────────────────
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
