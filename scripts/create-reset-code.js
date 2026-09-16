// Genera un código de recuperación de contraseña para un usuario existente.
// Uso: node scripts/create-reset-code.js nombre.usuario
require("dotenv").config();
const { pool } = require("../db");

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

async function main() {
  const username = (process.argv[2] || "").trim().toLowerCase();
  if (!username) {
    console.error("Uso: node scripts/create-reset-code.js nombre.usuario");
    process.exit(1);
  }

  const userResult = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
  if (userResult.rowCount === 0) {
    console.error("No existe un usuario con ese nombre de usuario.");
    process.exit(1);
  }

  const code = generateCode();
  await pool.query("INSERT INTO reset_codes (user_id, code) VALUES ($1, $2)", [
    userResult.rows[0].id,
    code,
  ]);

  console.log("Código de recuperación para " + username + ":");
  console.log("  " + code);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
