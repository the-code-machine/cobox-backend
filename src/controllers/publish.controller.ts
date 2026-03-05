import { Request, Response } from "express";
import { pool } from "./../db/db";

export const publishGame = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const { title, description, authorName, id } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

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
      INSERT INTO published_games (user_id, title, description, thumbnail, author_name, file_path, id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const values = [
      userId,
      title,
      description,
      thumbnailPath,
      authorName,
      gameFilePath,
      id,
    ];
    const result = await pool.query(query, values);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Publish Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── NEW: Update published game metadata (title, description, authorName, optional thumbnail) ───
export const updatePublishedGame = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    // Verify ownership first
    const ownerCheck = await pool.query(
      `SELECT id FROM published_games WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Game not found or unauthorized" });
    }

    const { title, description, authorName } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Only update thumbnail if a new file was uploaded
    const newThumbnailPath = files?.["thumbnail"]
      ? `/storage/thumbnails/${files["thumbnail"][0].filename}`
      : null;

    // Build query dynamically so thumbnail column is only touched when provided
    let query: string;
    let values: any[];

    if (newThumbnailPath) {
      query = `
        UPDATE published_games
        SET title = $1, description = $2, author_name = $3, thumbnail = $4, updated_at = NOW()
        WHERE id = $5 AND user_id = $6
        RETURNING *;
      `;
      values = [title, description, authorName, newThumbnailPath, id, userId];
    } else {
      query = `
        UPDATE published_games
        SET title = $1, description = $2, author_name = $3, updated_at = NOW()
        WHERE id = $4 AND user_id = $5
        RETURNING *;
      `;
      values = [title, description, authorName, id, userId];
    }

    const result = await pool.query(query, values);

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getAllPublishedGames = async (req: Request, res: Response) => {
  try {
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

export const getMyPublishedGames = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const query = `
      SELECT pg.*, u.name as creator_name 
      FROM published_games pg
      LEFT JOIN users u ON pg.user_id = u.id
      WHERE pg.user_id = $1
      ORDER BY pg.created_at DESC;
    `;
    const result = await pool.query(query, [userId]);
    return res
      .status(200)
      .json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error("Error in getMyPublishedGames:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const deletePublishedGame = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;
  try {
    const query = `
      DELETE FROM published_games 
      WHERE id = $1 AND user_id = $2 
      RETURNING *;
    `;
    const result = await pool.query(query, [id, userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Game not found or unauthorized" });
    }
    res
      .status(200)
      .json({ success: true, message: "Game removed from live server" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const incrementInstall = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const query = `
      UPDATE published_games 
      SET install_count = install_count + 1 
      WHERE id = $1 
      RETURNING install_count;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Game not found" });
    }
    res
      .status(200)
      .json({ success: true, install_count: result.rows[0].install_count });
  } catch (error) {
    console.error("Install increment error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const incrementView = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const query = `
      UPDATE published_games 
      SET view_count = view_count + 1 
      WHERE id = $1 
      RETURNING view_count;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Game not found" });
    }
    res
      .status(200)
      .json({ success: true, view_count: result.rows[0].view_count });
  } catch (error) {
    console.error("View increment error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
