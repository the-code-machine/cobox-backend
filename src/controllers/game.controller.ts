import { Request, Response } from "express";
import { pool } from "./../db/db";

// Create Game
export const createGame = async (req: Request, res: Response) => {
  const { title, description, data, thumbnail, view_count, install_count } =
    req.body;

  try {
    const result = await pool.query(
      `INSERT INTO games (title, description, data, thumbnail, view_count, install_count)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        title,
        description || null,
        data ? JSON.stringify(data) : null,
        thumbnail ? Buffer.from(thumbnail, "base64") : null, // if frontend sends base64
        view_count || 0,
        install_count || 0,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Get all games
export const getGames = async (_req: Request, res: Response) => {
  const result = await pool.query(
    "SELECT id, title, description, data, view_count, install_count, created_at FROM games ORDER BY id ASC"
  );
  res.json(result.rows);
};

// Get single game
export const getGame = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await pool.query("SELECT * FROM games WHERE id=$1", [id]);
  if (!result.rows[0]) return res.status(404).json({ error: "Game not found" });
  res.json(result.rows[0]);
};

// Update game
export const updateGame = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, data, thumbnail, view_count, install_count } =
    req.body;

  try {
    const result = await pool.query(
      `UPDATE games 
       SET title=$1, description=$2, data=$3, thumbnail=$4, view_count=$5, install_count=$6
       WHERE id=$7 RETURNING *`,
      [
        title,
        description || null,
        data ? JSON.stringify(data) : null,
        thumbnail ? Buffer.from(thumbnail, "base64") : null,
        view_count || 0,
        install_count || 0,
        id,
      ]
    );

    if (!result.rows[0])
      return res.status(404).json({ error: "Game not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Delete game
export const deleteGame = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM games WHERE id=$1 RETURNING *`, [
    id,
  ]);
  if (!result.rows[0]) return res.status(404).json({ error: "Game not found" });
  res.json({ message: "Game deleted", game: result.rows[0] });
};
