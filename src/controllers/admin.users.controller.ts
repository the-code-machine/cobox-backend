import { Request, Response } from "express";
import { pool } from "../db/db";

// ═══════════════════════════════════════════════════════════
//  GET /api/v1/admin/users/stats
// ═══════════════════════════════════════════════════════════
export const getUserStats = async (_req: Request, res: Response) => {
  try {
    const [
      totalUsersRes,
      totalCreatorsRes,
      totalPlayersRes,
      mauRes,
      dauRes,
      prevMonthUsersRes,
      prevMonthCreatorsRes,
      prevMonthPlayersRes,
      tiersRes,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users`),

      pool.query(`SELECT COUNT(DISTINCT user_id) FROM published_games`),

      pool.query(`
        SELECT COUNT(*) FROM users
        WHERE id NOT IN (
          SELECT DISTINCT user_id FROM published_games WHERE user_id IS NOT NULL
        )
      `),

      // MAU — registered in last 30 days (no updated_at on users)
      pool.query(`
        SELECT COUNT(*) FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),

      // DAU — registered today
      pool.query(`
        SELECT COUNT(*) FROM users
        WHERE DATE(created_at) = CURRENT_DATE
      `),

      pool.query(
        `SELECT COUNT(*) FROM users WHERE created_at < NOW() - INTERVAL '30 days'`,
      ),

      pool.query(
        `SELECT COUNT(DISTINCT user_id) FROM published_games WHERE created_at < NOW() - INTERVAL '30 days'`,
      ),

      pool.query(`
        SELECT COUNT(*) FROM users
        WHERE id NOT IN (
          SELECT DISTINCT user_id FROM published_games
          WHERE user_id IS NOT NULL AND created_at < NOW() - INTERVAL '30 days'
        )
        AND created_at < NOW() - INTERVAL '30 days'
      `),

      pool.query(
        `SELECT COUNT(DISTINCT wallet_type) AS count FROM user_wallets`,
      ),
    ]);

    const totalUsers = parseInt(totalUsersRes.rows[0].count, 10);
    const totalCreators = parseInt(totalCreatorsRes.rows[0].count, 10);
    const totalPlayers = parseInt(totalPlayersRes.rows[0].count, 10);
    const mau = parseInt(mauRes.rows[0].count, 10);
    const dau = parseInt(dauRes.rows[0].count, 10);
    const totalTiers = parseInt(tiersRes.rows[0].count, 10) || 0;

    const growthPct = (current: number, prev: number): number => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return parseFloat((((current - prev) / prev) * 100).toFixed(1));
    };

    const prevUsers = parseInt(prevMonthUsersRes.rows[0].count, 10);
    const prevCreators = parseInt(prevMonthCreatorsRes.rows[0].count, 10);
    const prevPlayers = parseInt(prevMonthPlayersRes.rows[0].count, 10);

    return res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        total_creators: totalCreators,
        total_players: totalPlayers,
        total_tiers: totalTiers,
        mau,
        dau,
        users_growth: growthPct(totalUsers, prevUsers),
        creators_growth: growthPct(totalCreators, prevCreators),
        players_growth: growthPct(totalPlayers, prevPlayers),
      },
    });
  } catch (err: any) {
    console.error("getUserStats error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
//  GET /api/v1/admin/users
//  ?page=1 &limit=10 &search=foo &role=creator|player|all
// ═══════════════════════════════════════════════════════════
export const getAdminUsers = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 10);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string)?.trim() || "";
    const role = (req.query.role as string)?.trim() || "all";

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (search) {
      conditions.push(
        `(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.mobile_number ILIKE $${idx})`,
      );
      values.push(`%${search}%`);
      idx++;
    }

    if (role === "creator") {
      conditions.push(
        `EXISTS (SELECT 1 FROM published_games pg WHERE pg.user_id = u.id)`,
      );
    } else if (role === "player") {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM published_games pg WHERE pg.user_id = u.id)`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM users u ${where}`,
      values,
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataSQL = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.mobile_number,
        u.coins,
        u.created_at,

        -- Primary wallet
        (
          SELECT uw.wallet_address
          FROM user_wallets uw
          WHERE uw.user_id = u.id AND uw.is_primary = true
          LIMIT 1
        ) AS wallet_address,

        -- Wallet count as device proxy
        (
          SELECT COUNT(*)::int
          FROM user_wallets uw
          WHERE uw.user_id = u.id
        ) AS logged_in_devices,

        -- Published asset titles
        (
          SELECT COALESCE(json_agg(pg.title ORDER BY pg.created_at DESC), '[]'::json)
          FROM published_games pg
          WHERE pg.user_id = u.id
        ) AS published_assets,

        -- Derived role
        CASE
          WHEN EXISTS (SELECT 1 FROM published_games pg WHERE pg.user_id = u.id)
          THEN 'creator'
          ELSE 'player'
        END AS role,

        -- last_active: most recent wallet connect, fallback to created_at
        COALESCE(
          (SELECT MAX(uw.connected_at) FROM user_wallets uw WHERE uw.user_id = u.id),
          u.created_at
        ) AS last_active

      FROM users u
      ${where}
      ORDER BY u.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const dataRes = await pool.query(dataSQL, [...values, limit, offset]);

    const users = dataRes.rows.map((row) => ({
      id: row.id,
      username: row.name || row.email?.split("@")[0] || "Unknown",
      email: row.email,
      mobile_number: row.mobile_number,
      wallet_address: row.wallet_address || "",
      social_id: row.email?.split("@")[0] || "",
      social_platform: "twitter",
      published_assets: row.published_assets || [],
      coins: row.coins || 0,
      last_active: row.last_active,
      logged_in_devices: row.logged_in_devices || 0,
      role: row.role,
      created_at: row.created_at,
    }));

    return res.json({
      success: true,
      users,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error("getAdminUsers error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
//  GET /api/v1/admin/users/:id
// ═══════════════════════════════════════════════════════════
export const getAdminUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [userRes, walletsRes, gamesRes] = await Promise.all([
      pool.query(
        `SELECT id, name, email, mobile_number, coins, created_at FROM users WHERE id = $1`,
        [id],
      ),
      pool.query(
        `SELECT id, wallet_address, wallet_type, chain_id, label, is_primary, connected_at
         FROM user_wallets WHERE user_id = $1 ORDER BY is_primary DESC, connected_at DESC`,
        [id],
      ),
      pool.query(
        `SELECT id, title, description, thumbnail, view_count, install_count, created_at
         FROM published_games WHERE user_id = $1 ORDER BY created_at DESC`,
        [id],
      ),
    ]);

    if (!userRes.rows[0])
      return res.status(404).json({ error: "User not found" });

    return res.json({
      success: true,
      user: {
        ...userRes.rows[0],
        wallets: walletsRes.rows,
        published_games: gamesRes.rows,
        role: gamesRes.rows.length > 0 ? "creator" : "player",
      },
    });
  } catch (err: any) {
    console.error("getAdminUserById error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
//  DELETE /api/v1/admin/users/:id
// ═══════════════════════════════════════════════════════════
export const deleteAdminUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 RETURNING id, name, email`,
      [id],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "User not found" });
    return res.json({
      success: true,
      message: `User deleted`,
      deleted: result.rows[0],
    });
  } catch (err: any) {
    console.error("deleteAdminUser error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
//  PATCH /api/v1/admin/users/:id/coins
// ═══════════════════════════════════════════════════════════
export const updateAdminUserCoins = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { coins } = req.body;
  if (typeof coins !== "number" || coins < 0)
    return res
      .status(400)
      .json({ error: "coins must be a non-negative number" });
  try {
    const result = await pool.query(
      `UPDATE users SET coins = $1 WHERE id = $2 RETURNING id, name, coins`,
      [coins, id],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "User not found" });
    return res.json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    console.error("updateAdminUserCoins error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
//  PATCH /api/v1/admin/users/:id/role
//  Requires migration.sql to have been run first
// ═══════════════════════════════════════════════════════════
export const updateAdminUserRole = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  const validRoles = ["player", "creator", "moderator", "admin"];
  if (!validRoles.includes(role))
    return res
      .status(400)
      .json({ error: `role must be one of: ${validRoles.join(", ")}` });
  try {
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'role'
    `);
    if (colCheck.rows.length === 0)
      return res
        .status(400)
        .json({ error: "role column missing — run migration.sql first" });

    const result = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, role`,
      [role, id],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "User not found" });
    return res.json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    console.error("updateAdminUserRole error:", err);
    return res.status(500).json({ error: err.message });
  }
};
