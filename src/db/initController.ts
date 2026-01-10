import { pool } from "./db";

export const initTables = async () => {
  const client = await pool.connect();
  try {
    console.log("⏳ Initializing tables...");

    await client.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    wallet_address VARCHAR(200) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    mobile_number VARCHAR(20),
    coins INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

    await client.query(`
  CREATE TABLE IF NOT EXISTS verification (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

    await client.query(`
  CREATE TABLE IF NOT EXISTS game_version (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    version TEXT,
    link TEXT
  );


  
`);
    await client.query(`
  CREATE TABLE IF NOT EXISTS published_games (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Link to creator
    title VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail TEXT NOT NULL,
    author_name VARCHAR(150) NOT NULL,
    file_path TEXT NOT NULL,
    view_count INTEGER DEFAULT 0,
    install_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
`);

    await client.query(`
CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'moderator');

CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role admin_role DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`);
    console.log("✅ Tables created or already exist.");
  } catch (err) {
    console.error("❌ Error initializing tables:", err);
  } finally {
    client.release();
  }
};
