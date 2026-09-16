const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");

const router = express.Router();

function publicUser(row) {
  return { id: row.id, username: row.username, fullName: row.full_name, role: row.role };
}

router.post("/register", async (req, res) => {
  const { code, fullName, username, password } = req.body || {};

  if (!code || !fullName || !username || !password) {
    return res.status(400).json({ error: "Completa todos los campos." });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const codeResult = await client.query(
      "SELECT id FROM invite_codes WHERE code = $1 AND used_by IS NULL FOR UPDATE",
      [String(code).trim().toUpperCase()]
    );
    if (codeResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El código de invitación no es válido o ya fue usado." });
    }

    const existing = await client.query("SELECT id FROM users WHERE username = $1", [
      String(username).trim().toLowerCase(),
    ]);
    if (existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Ese usuario ya existe." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await client.query(
      "INSERT INTO users (username, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id, username, full_name, role",
      [String(username).trim().toLowerCase(), String(fullName).trim(), passwordHash]
    );
    const user = inserted.rows[0];

    await client.query(
      "UPDATE invite_codes SET used_by = $1, used_at = now() WHERE id = $2",
      [user.id, codeResult.rows[0].id]
    );

    await client.query("COMMIT");

    req.session.userId = user.id;
    return res.json({ user: publicUser(user) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("register error", err);
    return res.status(500).json({ error: "No se pudo crear la cuenta. Intenta de nuevo." });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Ingresa tu usuario y contraseña." });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      String(username).trim().toLowerCase(),
    ]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    req.session.userId = user.id;
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ error: "No se pudo iniciar sesión. Intenta de nuevo." });
  }
});

router.post("/reset-password", async (req, res) => {
  const { username, code, password } = req.body || {};
  if (!username || !code || !password) {
    return res.status(400).json({ error: "Completa todos los campos." });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query("SELECT id FROM users WHERE username = $1", [
      String(username).trim().toLowerCase(),
    ]);
    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Usuario o código incorrectos." });
    }
    const userId = userResult.rows[0].id;

    const codeResult = await client.query(
      "SELECT id FROM reset_codes WHERE user_id = $1 AND code = $2 AND used_at IS NULL FOR UPDATE",
      [userId, String(code).trim().toUpperCase()]
    );
    if (codeResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Usuario o código incorrectos." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
    await client.query("UPDATE reset_codes SET used_at = now() WHERE id = $1", [codeResult.rows[0].id]);

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("reset-password error", err);
    return res.status(500).json({ error: "No se pudo restablecer la contraseña. Intenta de nuevo." });
  } finally {
    client.release();
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "No autenticado." });
  }
  const result = await pool.query("SELECT id, username, full_name, role FROM users WHERE id = $1", [
    req.session.userId,
  ]);
  if (result.rowCount === 0) {
    return res.status(401).json({ error: "No autenticado." });
  }
  return res.json({ user: publicUser(result.rows[0]) });
});

module.exports = router;
