import { Request, Response } from "express";
import { pool } from "./../db/db";
import { generateTokens } from "../middlewares/auth.middleware";

// ─────────────────────────────────────────────
//  LOGIN OR CREATE USER  (Email-based only)
// ─────────────────────────────────────────────
export const loginOrCreateUser = async (req: any, res: any) => {
  const { email, name, mobile_number, verificationToken } = req.body;

  // Email is now required - wallets are handled separately
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "Email is required to login." });
  }

  try {
    let user = null;

    // ── STEP 1: Find user by email ──
    const emailRes = await pool.query(
      `SELECT * FROM users WHERE email = $1 LIMIT 1`,
      [email.trim().toLowerCase()],
    );
    user = emailRes.rows[0];

    if (user) {
      // ── STEP 2A: User EXISTS — update name/mobile if we got better data ──
      const updates: string[] = [];
      const values: any[] = [];
      let index = 1;

      const isGenericName =
        !user.name || user.name === "New User" || user.name.includes("User");

      if (name && isGenericName && name.trim() !== user.name) {
        updates.push(`name = $${index++}`);
        values.push(name.trim());
        user.name = name.trim();
      }

      if (mobile_number && !user.mobile_number) {
        updates.push(`mobile_number = $${index++}`);
        values.push(mobile_number.trim());
        user.mobile_number = mobile_number.trim();
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(user.id);
        const updateRes = await pool.query(
          `UPDATE users SET ${updates.join(", ")} WHERE id = $${index} RETURNING *`,
          values,
        );
        user = updateRes.rows[0];
      }
    } else {
      // ── STEP 2B: User NOT FOUND — create new ──
      const insertRes = await pool.query(
        `INSERT INTO users (name, email, mobile_number)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [
          name?.trim() || "New User",
          email.trim().toLowerCase(),
          mobile_number?.trim() || null,
        ],
      );
      user = insertRes.rows[0];
    }

    // ── STEP 3: Handle Launcher Verification Token (kept for game launcher flow) ──
    if (verificationToken) {
      await pool.query(
        `INSERT INTO verification (user_id, token)
         VALUES ($1, $2)
         ON CONFLICT (token) DO NOTHING`,
        [user.id, verificationToken],
      );
    }

    // ── STEP 4: Return user + JWT tokens ──
    const tokens = generateTokens(user.id);

    return res.json({
      success: true,
      user,
      tokens,
      message: "Login successful",
    });
  } catch (err: any) {
    console.error("Error in loginOrCreateUser:", err);
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "User conflict. Please try logging in again." });
    }
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  VERIFY LAUNCHER TOKEN
//  Used by game launcher redirect login flow
// ─────────────────────────────────────────────
export const verifyLauncherToken = async (req: any, res: any) => {
  const { verificationToken } = req.body;
  if (!verificationToken)
    return res.status(400).json({ error: "Token required" });

  try {
    const verification = (
      await pool.query(`SELECT * FROM verification WHERE token = $1`, [
        verificationToken,
      ])
    ).rows[0];

    if (!verification)
      return res.status(401).json({ error: "Invalid or expired token" });

    const user = (
      await pool.query(`SELECT * FROM users WHERE id = $1`, [
        verification.user_id,
      ])
    ).rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });

    const tokens = generateTokens(user.id);

    // One-time token — delete after use
    await pool.query(`DELETE FROM verification WHERE id = $1`, [
      verification.id,
    ]);

    return res.json({ success: true, user, tokens });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  USER CRUD
// ─────────────────────────────────────────────

export const createUser = async (req: Request, res: Response) => {
  const { name, email, mobile_number, coins } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, mobile_number, coins)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, email.toLowerCase(), mobile_number, coins || 0],
    );
    return res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getUsers = async (_req: Request, res: Response) => {
  const result = await pool.query(
    "SELECT id, name, email, mobile_number, coins, created_at FROM users ORDER BY id ASC",
  );
  return res.json({ success: true, data: result.rows });
};

export const getUserDetail = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT id, name, email, mobile_number, coins, created_at FROM users WHERE id = $1",
    [id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  return res.json({ success: true, user: result.rows[0] });
};

export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, mobile_number, coins } = req.body;
  const result = await pool.query(
    `UPDATE users SET name=$1, email=$2, mobile_number=$3, coins=$4, updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [name, email?.toLowerCase(), mobile_number, coins, id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  return res.json({ success: true, user: result.rows[0] });
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING *`,
    [id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  return res.json({
    success: true,
    message: "User deleted",
    user: result.rows[0],
  });
};

export const updateCoins = async (req: any, res: any) => {
  const { id } = req.params;
  const { coins } = req.body;

  if (req.userId !== Number(id))
    return res.status(403).json({ error: "Forbidden" });

  const result = await pool.query(
    `UPDATE users SET coins = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [coins, id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  return res.json({ success: true, user: result.rows[0] });
};

// ─────────────────────────────────────────────
//  GET CURRENT USER  (from JWT)
// ─────────────────────────────────────────────
export const getMe = async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, mobile_number, coins, created_at FROM users WHERE id = $1`,
      [req.userId],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "User not found" });
    return res.json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
