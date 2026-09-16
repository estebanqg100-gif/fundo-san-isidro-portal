// Genera nuevos códigos de invitación (8 caracteres).
// Uso: node scripts/create-invite-codes.js [cantidad]
require("dotenv").config();
const { pool } = require("../db");

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin I/O/0/1 para evitar confusiones

function generateCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

async function main() {
  const count = parseInt(process.argv[2], 10) || 1;
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(generateCode());
  }

  const client = await pool.connect();
  try {
    for (const code of codes) {
      await client.query("INSERT INTO invite_codes (code) VALUES ($1)", [code]);
    }
  } finally {
    client.release();
  }

  console.log("Códigos de invitación creados:");
  codes.forEach((c) => console.log("  " + c));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
