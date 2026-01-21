import { Request, Response } from "express";
import { pool } from "./../db/db";
import { generateTokens } from "../middlewares/auth.middleware";

export const loginOrCreateUser = async (req: any, res: any) => {
  const { email, name, wallet_address, mobile_number, verificationToken } =
    req.body;

  try {
    let user = null;

    // --- STEP 1: Find User (Prioritize Wallet, then Email) ---

    // A. Try finding by Wallet Address first (Strongest link for Web3)
    if (wallet_address) {
      const walletQuery = `SELECT * FROM users WHERE wallet_address = $1 LIMIT 1`;
      const walletRes = await pool.query(walletQuery, [wallet_address]);
      user = walletRes.rows[0];
    }

    // B. If not found by wallet, try finding by Email
    if (!user && email) {
      const emailQuery = `SELECT * FROM users WHERE email = $1 LIMIT 1`;
      const emailRes = await pool.query(emailQuery, [email]);
      user = emailRes.rows[0];
    }

    // --- STEP 2: Logic to UPDATE or CREATE ---

    if (user) {
      // User FOUND. Now check if we need to upgrade their data.

      const updates = [];
      const values = [];
      let index = 1;

      // Check 1: Update Email if the DB has a placeholder/null and we have a real one
      // (e.g. upgrading from "0x...@wallet.connect" to "caplock.connect@gmail.com")
      const isPlaceholderEmail =
        !user.email || user.email.includes("@wallet.connect");
      if (email && (isPlaceholderEmail || user.email !== email)) {
        // Only update if the new email is "better" (not a placeholder)
        if (!email.includes("@wallet.connect")) {
          updates.push(`email = $${index++}`);
          values.push(email);
          // Update local object for response
          user.email = email;
        }
      }

      // Check 2: Update Name if DB has generic name and we have a specific one
      const isGenericName =
        !user.name ||
        user.name.includes("User") ||
        user.name.includes("Wallet");
      if (name && isGenericName && name !== user.name) {
        updates.push(`name = $${index++}`);
        values.push(name);
        user.name = name;
      }

      // Check 3: Update Wallet if found by email but wallet is missing/different
      if (wallet_address && user.wallet_address !== wallet_address) {
        updates.push(`wallet_address = $${index++}`);
        values.push(wallet_address);
        user.wallet_address = wallet_address;
      }

      // EXECUTE UPDATES if any needed
      if (updates.length > 0) {
        values.push(user.id); // Add ID as the last parameter
        const updateQuery = `UPDATE users SET ${updates.join(", ")} WHERE id = $${index} RETURNING *`;
        const updateRes = await pool.query(updateQuery, values);
        user = updateRes.rows[0]; // Get the fresh, updated user
      }
    } else {
      // --- STEP 3: Create New User (If absolutely no match found) ---

      // Guard against empty payloads
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
          name?.trim() || "New User",
          email?.trim() || null,
          wallet_address?.trim() || null,
          mobile_number?.trim() || null,
        ],
      );
      user = insertResult.rows[0];
    }

    // --- STEP 4: Handle Verification Token (Optional) ---
    if (verificationToken) {
      await pool.query(
        `INSERT INTO verification (user_id, token)
         VALUES ($1, $2)
         ON CONFLICT (token) DO NOTHING`,
        [user.id, verificationToken],
      );
    }

    // --- STEP 5: Return User & Tokens ---
    const tokens = generateTokens(user.id);

    res.json({
      user,
      tokens,
      message: "Login successful",
    });
  } catch (err: any) {
    console.error("Error in loginOrCreateUser:", err);
    // Handle unique constraint violations gracefully (rare race condition)
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "User conflict. Please try logging in again." });
    }
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
