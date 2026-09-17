const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");

const router = express.Router();

// Todas las rutas de este archivo requieren sesión activa Y rol admin
// (se monta detrás de requireAuthApi + requireAdminApi en server.js).

// Alfabeto sin 0/O, 1/I/L para evitar confusión al copiar el código a mano.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genCode(len) {
  len = len || 8;
  var bytes = crypto.randomBytes(len);
  var out = "";
  for (var i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

router.get("/users", async (req, res) => {
  try {
    var r = await pool.query(
      "SELECT id, username, full_name, role, created_at FROM users ORDER BY created_at ASC"
    );
    return res.json({ users: r.rows });
  } catch (err) {
    console.error("GET /api/admin/users error", err);
    return res.status(500).json({ error: "No se pudieron cargar los usuarios." });
  }
});

router.get("/invite-codes", async (req, res) => {
  try {
    var r = await pool.query(
      "SELECT ic.id, ic.code, ic.created_at, ic.used_at, u.full_name AS used_by_name, u.username AS used_by_username " +
        "FROM invite_codes ic LEFT JOIN users u ON u.id = ic.used_by " +
        "ORDER BY ic.created_at DESC"
    );
    return res.json({ codes: r.rows });
  } catch (err) {
    console.error("GET /api/admin/invite-codes error", err);
    return res.status(500).json({ error: "No se pudieron cargar los códigos de invitación." });
  }
});

router.post("/invite-codes", async (req, res) => {
  try {
    var count = Math.min(Math.max(parseInt((req.body && req.body.count) || 1, 10) || 1, 1), 10);
    var created = [];
    for (var i = 0; i < count; i++) {
      var inserted = null;
      var attempts = 0;
      while (attempts < 5 && !inserted) {
        var code = genCode(8);
        try {
          var r = await pool.query(
            "INSERT INTO invite_codes (code) VALUES ($1) RETURNING id, code, created_at",
            [code]
          );
          inserted = r.rows[0];
        } catch (e) {
          if (e.code === "23505") { attempts++; continue; } // choque de código único, reintenta
          throw e;
        }
      }
      if (!inserted) throw new Error("No se pudo generar un código único tras varios intentos.");
      created.push(inserted);
    }
    return res.json({ codes: created });
  } catch (err) {
    console.error("POST /api/admin/invite-codes error", err);
    return res.status(500).json({ error: "No se pudieron generar los códigos." });
  }
});

router.delete("/invite-codes/:id", async (req, res) => {
  try {
    var r = await pool.query(
      "DELETE FROM invite_codes WHERE id = $1 AND used_by IS NULL RETURNING id",
      [req.params.id]
    );
    if (r.rowCount === 0) {
      return res.status(400).json({ error: "El código no existe o ya fue usado — un código usado no se puede revocar." });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/invite-codes/:id error", err);
    return res.status(500).json({ error: "No se pudo revocar el código." });
  }
});

router.post("/reset-codes", async (req, res) => {
  try {
    var userId = req.body && req.body.userId;
    if (!userId) return res.status(400).json({ error: "Falta el usuario." });
    var u = await pool.query("SELECT id, full_name FROM users WHERE id = $1", [userId]);
    if (u.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado." });
    var code = genCode(8);
    var r = await pool.query(
      "INSERT INTO reset_codes (user_id, code) VALUES ($1, $2) RETURNING id, code, created_at",
      [userId, code]
    );
    return res.json({ code: r.rows[0].code, forUser: u.rows[0].full_name });
  } catch (err) {
    console.error("POST /api/admin/reset-codes error", err);
    return res.status(500).json({ error: "No se pudo generar el código de recuperación." });
  }
});

module.exports = router;
