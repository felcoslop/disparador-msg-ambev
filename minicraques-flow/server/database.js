import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'minicraques.sqlite');

let db;

export async function initializeDB() {
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    // Leads Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE NOT NULL,
            nome_pessoa TEXT,
            nome_bairro TEXT,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Conversations Table (State Machine)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE NOT NULL,
            state TEXT, -- Node ID from React Flow
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            responses TEXT, -- JSON array of user responses
            opted_out BOOLEAN DEFAULT 0
        );
    `);

    // Email Logs
    await db.exec(`
        CREATE TABLE IF NOT EXISTS email_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_phone TEXT,
            template_name TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(lead_phone) REFERENCES leads(phone)
        );
    `);

    // Flow Config Table (React Flow JSON)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS flow_config (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL, -- JSON string of nodes and edges
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Settings Table (Credentials)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    console.log('[DB] Minicraques SQLite Initialized with Flows & Settings');
    return db;
}

export async function getDB() {
    if (!db) await initializeDB();
    return db;
}
