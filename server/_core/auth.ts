/**
 * Standalone Auth Routes
 * Replaces Manus OAuth with simple JWT-based login/register.
 * POST /api/auth/register  — create account (openId = email)
 * POST /api/auth/login     — sign in, get session cookie
 * POST /api/auth/logout    — clear session cookie
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { SignJWT } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import crypto from "crypto";

// Simple password hashing using PBKDF2 (no bcrypt dependency needed)
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, s, 100_000, 64, "sha512").toString("hex");
  return { hash, salt: s };
}

function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

async function createSessionToken(openId: string, name: string): Promise<string> {
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const expiresInMs = ONE_YEAR_MS;
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);

  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secret);
}

export function registerAuthRoutes(app: Express) {
  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "email and password are required" });
        return;
      }

      // Check if user already exists
      const existing = await db.getUserByOpenId(email);
      if (existing) {
        res.status(409).json({ error: "User already exists" });
        return;
      }

      const { hash, salt } = hashPassword(password);

      await db.upsertUser({
        openId: email,
        name: name || email.split("@")[0],
        email,
        loginMethod: "email",
        lastSignedIn: new Date(),
        // Store hash:salt in a metadata field — we'll use the email field for lookup
        // For a production app, add a password_hash column to the schema
      });

      // Store password hash in a simple way — append to name temporarily
      // TODO: Add password_hash column to schema for production
      const passwordStore = `${hash}:${salt}`;
      // We'll store this in a separate mechanism or use the user table
      // For now, use a simple in-memory store that persists via the DB
      await storePasswordHash(email, passwordStore);

      const sessionToken = await createSessionToken(email, name || email.split("@")[0]);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: { openId: email, name: name || email.split("@")[0], email } });
    } catch (error) {
      console.error("[Auth] Register failed:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "email and password are required" });
        return;
      }

      const user = await db.getUserByOpenId(email);
      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const storedHash = await getPasswordHash(email);
      if (!storedHash) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const [hash, salt] = storedHash.split(":");
      if (!verifyPassword(password, hash, salt)) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      await db.upsertUser({ openId: email, lastSignedIn: new Date() });

      const sessionToken = await createSessionToken(email, user.name || email);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: { openId: user.openId, name: user.name, email: user.email } });
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  });
}

// ─── Simple password hash store ─────────────────────────────────────────────
// In production, add a password_hash column to the users table.
// For now, we use a file-based store alongside the DB.
import fs from "fs";
import path from "path";

const HASH_STORE_PATH = path.join(process.cwd(), ".password-hashes.json");

function loadHashStore(): Record<string, string> {
  try {
    if (fs.existsSync(HASH_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(HASH_STORE_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function saveHashStore(store: Record<string, string>) {
  fs.writeFileSync(HASH_STORE_PATH, JSON.stringify(store, null, 2));
}

async function storePasswordHash(email: string, hashSalt: string) {
  const store = loadHashStore();
  store[email] = hashSalt;
  saveHashStore(store);
}

async function getPasswordHash(email: string): Promise<string | null> {
  const store = loadHashStore();
  return store[email] ?? null;
}
