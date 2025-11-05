// Create new game version entry
import { pool as client } from "./../db/db";

export const createGameVersion = async (req, res) => {
  try {
    const { title, version, link } = req.body;

    if (!title || !version || !link) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const result = await client.query(
      `INSERT INTO game_version (title, version, link)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [title, version, link]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating game version:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getGameVersionById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await client.query(
      `SELECT * FROM game_version WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Game version not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching game version:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update game version by title
export const updateGameVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { version, link } = req.body;

    const result = await client.query(
      `UPDATE game_version 
       SET version = $1, link = $2 
       WHERE id = $3
       RETURNING *`,
      [version, link, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Game version not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error updating game version:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete game version by title
export const deleteGameVersion = async (req, res) => {
  try {
    const { title } = req.params;

    const result = await client.query(
      `DELETE FROM game_version WHERE title = $1 RETURNING *`,
      [title]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Game version not found" });
    }

    res.status(200).json({ message: "Game version deleted successfully" });
  } catch (err) {
    console.error("Error deleting game version:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
