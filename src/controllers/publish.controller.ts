import { Request, Response } from "express";
import { pool } from "./../db/db";

export const publishGame = async (req: Request, res: Response) => {
  try {
    const { userId, title, description, authorName } = req.body;

    // Access files uploaded by Multer
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // In Express, path will look like "storage/thumbnails/filename.png"
    // We store this string in the DB
    const thumbnailPath = files["thumbnail"]
      ? `/storage/thumbnails/${files["thumbnail"][0].filename}`
      : null;
    const gameFilePath = files["gameFile"]
      ? `/storage/games/${files["gameFile"][0].filename}`
      : null;

    if (!thumbnailPath || !gameFilePath) {
      return res
        .status(400)
        .json({ error: "Both thumbnail and game file are compulsory." });
    }

    const query = `
      INSERT INTO published_games (user_id, title, description, thumbnail, author_name, file_path)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [
      userId,
      title,
      description,
      thumbnailPath,
      authorName,
      gameFilePath,
    ];
    const result = await pool.query(query, values);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Publish Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
export const getAllPublishedGames = async (req: Request, res: Response) => {
  try {
    // Fetch games with an optional join to get user details if needed
    const query = `
      SELECT pg.*, u.name as creator_name 
      FROM published_games pg
      LEFT JOIN users u ON pg.user_id = u.id
      ORDER BY pg.created_at DESC;
    `;

    const result = await pool.query(query);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error in getAllPublishedGames:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getGameById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Increment view count while fetching
    const query = `
      UPDATE published_games 
      SET view_count = view_count + 1 
      WHERE id = $1 
      RETURNING *;
    `;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Game not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in getGameById:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
