import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";
const JWT_EXPIRE = "365d";
const REFRESH_EXPIRE = "365d";

// ─────────────────────────────────────────────
//  GENERATE TOKENS
// ─────────────────────────────────────────────
export const generateTokens = (userId: number) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
  const refreshToken = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: REFRESH_EXPIRE,
  });
  return { accessToken, refreshToken };
};

// ─────────────────────────────────────────────
//  REFRESH TOKEN ENDPOINT
//  POST /api/token/refresh
// ─────────────────────────────────────────────
export const refreshToken = (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(400).json({ error: "Refresh token required" });

  try {
    const payload: any = jwt.verify(refreshToken, JWT_SECRET);
    const tokens = generateTokens(payload.userId);
    return res.json({ success: true, tokens });
  } catch {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};

// ─────────────────────────────────────────────
//  AUTHENTICATE JWT  (middleware)
//  Attach req.userId for use in controllers
// ─────────────────────────────────────────────
declare module "express-serve-static-core" {
  interface Request {
    userId?: number;
  }
}

export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction,
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
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ─────────────────────────────────────────────
//  OPTIONAL AUTH  (doesn't block if no token)
//  Useful for routes that work for both guests & logged-in users
// ─────────────────────────────────────────────
export const optionalAuthJWT = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const payload: any = jwt.verify(token, JWT_SECRET);
      req.userId = payload.userId;
    } catch {
      // Token invalid — just continue as guest, don't block
    }
  }
  next();
};
