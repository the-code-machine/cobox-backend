import { Request, Response } from "express";
import { pool } from "./../db/db";
import { generateTokens } from "../middlewares/auth.middleware"; // Ensure this is imported

export const loginOrCreateUser = async (req: any, res: any) => {
  const { email, name, wallet_address, mobile_number, verificationToken } =
    req.body;

  try {
    const conditions: string[] = [];
    const values: any[] = [];
    let index = 1;

    // Helper to add only valid (non-null, non-empty) fields
    const addCondition = (field: string, value: any) => {
      if (value && String(value).trim() !== "") {
        conditions.push(`${field} = $${index++}`);
        values.push(value.trim());
      }
    };

    addCondition("email", email);
    addCondition("wallet_address", wallet_address);
    addCondition("mobile_number", mobile_number);
    addCondition("name", name);

    let user = null;

    // 1. Try to find existing user
    if (conditions.length > 0) {
      const query = `SELECT * FROM users WHERE ${conditions.join(" OR ")} LIMIT 1`;
      const result = await pool.query(query, values);
      user = result.rows[0];
    }

    // 2. If no user found, create a new one
    if (!user) {
      // Guard: Don't create empty users
      if (!email && !wallet_address && !mobile_number) {
        return res
          .status(400)
          .json({ error: "At least email, wallet, or mobile required." });
      }

      const insertResult = await pool.query(
        `INSERT INTO users (name, email, wallet_address, mobile_number)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          name && String(name).trim() !== "" ? name.trim() : null,
          email && String(email).trim() !== "" ? email.trim() : null,
          wallet_address && String(wallet_address).trim() !== ""
            ? wallet_address.trim()
            : null,
          mobile_number && String(mobile_number).trim() !== ""
            ? mobile_number.trim()
            : null,
        ],
      );
      user = insertResult.rows[0];
    }

    // 3. Save Verification Token (If provided - e.g. for Desktop Launcher Sync)
    // We do this silently so it doesn't block the web login
    if (verificationToken) {
      await pool.query(
        `INSERT INTO verification (user_id, token)
         VALUES ($1, $2)
         ON CONFLICT (token) DO NOTHING`,
        [user.id, verificationToken],
      );
    }

    // 4. GENERATE TOKENS IMMEDIATELY (The Fix)
    // This allows the web frontend to log in right now without a second call
    const tokens = generateTokens(user.id);

    // 5. Return User AND Tokens
    res.json({
      user,
      tokens, // Frontend can now use tokens.accessToken
      message: "Login successful",
    });
  } catch (err: any) {
    console.error("Error in loginOrCreateUser:", err);
    res.status(500).json({ error: err.message });
  }
};
// Verify launcher token
export const verifyLauncherToken = async (req: any, res: any) => {
  const { verificationToken } = req.body;
  if (!verificationToken)
    return res.status(400).json({ error: "Token required" });

  try {
    const verification = (
      await pool.query(`SELECT * FROM verification WHERE token=$1`, [
        verificationToken,
      ])
    ).rows[0];

    if (!verification) return res.status(401).json({ error: "Invalid token" });

    const user = (
      await pool.query(`SELECT * FROM users WHERE id=$1`, [
        verification.user_id,
      ])
    ).rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const tokens = generateTokens(user.id);

    await pool.query(`DELETE FROM verification WHERE id=$1`, [verification.id]);

    res.json({ user, tokens });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// CRUD
export const createUser = async (req: Request, res: Response) => {
  const { name, wallet_address, email, mobile_number, coins } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO users (name, wallet_address, email, mobile_number, coins) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, wallet_address, email, mobile_number, coins || 0],
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getUsers = async (_req: Request, res: Response) => {
  const result = await pool.query("SELECT * FROM users ORDER BY id ASC");
  res.json(result.rows);
};

export const getUserDetail = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(result.rows[0]);
};

export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, wallet_address, email, mobile_number, coins } = req.body;
  const result = await pool.query(
    `UPDATE users SET name=$1, wallet_address=$2, email=$3, mobile_number=$4, coins=$5 WHERE id=$6 RETURNING *`,
    [name, wallet_address, email, mobile_number, coins, id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(result.rows[0]);
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM users WHERE id=$1 RETURNING *`, [
    id,
  ]);
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  res.json({ message: "User deleted", user: result.rows[0] });
};

export const updateCoins = async (req: any, res: any) => {
  const { id } = req.params;
  const { coins } = req.body;

  if (req.userId !== Number(id))
    return res.status(403).json({ error: "Forbidden" });

  const result = await pool.query(
    `UPDATE users SET coins=$1 WHERE id=$2 RETURNING *`,
    [coins, id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(result.rows[0]);
};
