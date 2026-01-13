import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db;

export async function initializeDB() {
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    // Enable Foreign Keys
    await db.exec('PRAGMA foreign_keys = ON;');

    // Users Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );
    `);

    // User Config Table (Per User)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_config (
            user_id INTEGER PRIMARY KEY,
            token TEXT,
            phoneId TEXT,
            wabaId TEXT,
            templateName TEXT,
            mapping TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);

    // Migration: Add new columns if they don't exist
    const columns = await db.all("PRAGMA table_info(user_config)");
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('templateName')) {
        await db.exec('ALTER TABLE user_config ADD COLUMN templateName TEXT');
    }
    if (!columnNames.includes('mapping')) {
        await db.exec('ALTER TABLE user_config ADD COLUMN mapping TEXT');
    }

    // History Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            template TEXT,
            total INTEGER,
            success INTEGER,
            errors INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Received Messages Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS received_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_phone TEXT,
            contact_name TEXT,
            message_body TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_from_me BOOLEAN DEFAULT 0
        );
    `);

    // Seed Default User if empty
    const admin = await db.get('SELECT * FROM users WHERE email = ?', '99847120@ab-inbev.com');
    if (!admin) {
        await db.run('INSERT INTO users (email, password) VALUES (?, ?)', '99847120@ab-inbev.com', 'admin');
    }

    console.log('[DB] SQLite Initialized');
    return db;
}

export async function getDB() {
    if (!db) await initializeDB();
    return db;
}
