import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";
const JWT_EXPIRE = "1m";
const REFRESH_EXPIRE = "7d";

export const generateTokens = (userId: number) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
  const refreshToken = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: REFRESH_EXPIRE,
  });
  return { accessToken, refreshToken };
};

export const refreshToken = (req: any, res: any) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(400).json({ error: "Refresh token required" });

  try {
    const payload: any = jwt.verify(refreshToken, JWT_SECRET);
    const tokens = generateTokens(payload.userId);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};

declare module "express-serve-static-core" {
  interface Request {
    userId?: number;
  }
}

export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authorization header missing or invalid" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
