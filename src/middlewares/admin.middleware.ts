import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 1. Get token from Cookies instead of Header
  const token = req.cookies["auth_token"];

  if (!token) {
    // 401: Unauthorized (No token found)
    return res.status(401).json({ error: "Authentication required" });
  }

  // 2. Verify the token
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      // 403: Forbidden (Token invalid or expired)
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    // @ts-ignore
    req.user = user;
    next();
  });
};
