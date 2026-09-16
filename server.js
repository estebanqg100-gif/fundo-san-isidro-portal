require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const { pool } = require("./db");
const authRoutes = require("./routes/auth");

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

app.get("/portal", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "portal.html"));
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Fundo San Isidro portal escuchando en el puerto ${PORT}`);
});
