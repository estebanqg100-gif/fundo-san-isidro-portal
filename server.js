require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const { pool } = require("./db");
const authRoutes = require("./routes/auth");
const sectoresRoutes = require("./routes/sectores");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(express.json());

app.use(
  session({
    store: new pgSession({ pool, tableName: "sessions", createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 dias
      sameSite: "lax",
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/");
  }
  next();
}

function requireAuthApi(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "No autenticado." });
  }
  next();
}

async function requireAdminApi(req, res, next) {
  try {
    var r = await pool.query("SELECT role FROM users WHERE id = $1", [req.session.userId]);
    if (r.rowCount === 0 || r.rows[0].role !== "admin") {
      return res.status(403).json({ error: "No autorizado." });
    }
    next();
  } catch (err) {
    console.error("requireAdminApi error", err);
    res.status(500).json({ error: "Error de autorización." });
  }
}

app.use("/api/sectores", requireAuthApi, sectoresRoutes);
app.use("/api/admin", requireAuthApi, requireAdminApi, adminRoutes);

app.get("/portal", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "portal.html"));
});

app.get("/portal/mapa-sectores", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mapa-sectores.html"));
});

app.get("/portal/admin", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Fundo San Isidro portal escuchando en el puerto ${PORT}`);
});
