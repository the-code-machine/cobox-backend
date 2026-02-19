import { pool } from "./db";

export const initTables = async () => {
  const client = await pool.connect();
  try {
    console.log("⏳ Initializing tables...");

    // ── USERS (email-based, no wallet_address column) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(100),
        email         VARCHAR(150) UNIQUE NOT NULL,
        mobile_number VARCHAR(20),
        coins         INTEGER DEFAULT 0,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── USER WALLETS (separate table, multiple wallets per user) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wallet_address VARCHAR(255) NOT NULL,
        wallet_type    VARCHAR(50)  DEFAULT 'unknown',
        chain_id       INTEGER,
        label          VARCHAR(100),
        is_primary     BOOLEAN      DEFAULT false,
        connected_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(wallet_address),
        UNIQUE(user_id, wallet_address)
      );
    `);

    // ── VERIFICATION (launcher token flow — unchanged) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS verification (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token      VARCHAR(500) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── GAME VERSION ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_version (
        id      SERIAL PRIMARY KEY,
        title   VARCHAR(200) NOT NULL,
        version TEXT,
        link    TEXT
      );
    `);

    // ── PUBLISHED GAMES ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS published_games (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        description   TEXT,
        thumbnail     TEXT NOT NULL,
        author_name   VARCHAR(150) NOT NULL,
        file_path     TEXT NOT NULL,
        view_count    INTEGER DEFAULT 0,
        install_count INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── ADMINS ──
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
          CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'moderator');
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id            SERIAL PRIMARY KEY,
        first_name    VARCHAR(100) NOT NULL,
        last_name     VARCHAR(100) NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role          admin_role DEFAULT 'admin',
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Tables initialized successfully.");
  } catch (err) {
    console.error("❌ Error initializing tables:", err);
  } finally {
    client.release();
  }
};
