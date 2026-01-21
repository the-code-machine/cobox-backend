import { Request, Response } from "express";
import { pool } from "./../db/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key";

// --- 1. REGISTER ADMIN ---
export const createAdmin = async (req: Request, res: Response) => {
  const { firstName, lastName, email, password, role } = req.body;

  try {
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO admins (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role`,
      [firstName, lastName, email, hashedPassword, role || "admin"]
    );

    res.status(201).json({ message: "Admin created", admin: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- 2. LOGIN ADMIN ---

export const loginAdmin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM admins WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: admin.id, role: admin.role, email: admin.email },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "1d" }
    );

    // --- NEW: SET COOKIE DIRECTLY IN HEADER ---
    res.cookie("auth_token", token, {
      httpOnly: true, // Prevents JavaScript from reading it (Security)
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      sameSite: "lax", // CSRF protection
      path: "/", // Accessible across the app
      maxAge: 24 * 60 * 60 * 1000, // 1 Day
    });

    // Return User Info (BUT NO TOKEN in body)
    res.json({
      message: "Login successful",
      user: {
        id: admin.id,
        firstName: admin.first_name,
        lastName: admin.last_name,
        role: admin.role,
        email: admin.email,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- 3. GET ADMIN PROFILE ---
export const getAdminProfile = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - user is added by middleware
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, first_name, last_name, email, role, created_at FROM admins WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
