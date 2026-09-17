const express = require("express");
const { pool } = require("../db");
 
const router = express.Router();
 
// Todas las rutas de este archivo requieren sesión activa (se monta detrás
// de requireAuth en server.js). Son de solo lectura: la escritura de estos
// datos ocurre exclusivamente desde una sincronización manual que Esteban
// dispara explícitamente (nunca desde el navegador).
 
router.get("/resumen", async (req, res) => {
  try {
    const [resumen, sync] = await Promise.all([
      pool.query(
        "SELECT sector_id, sector_nombre, labores, supervisores, control_calidad, lotes, plantas_evaluadas, racimos_evaluados, total_errores, pct_error, to_char(fecha_ultima, 'YYYY-MM-DD') AS fecha_ultima, actualizado_en FROM evaluaciones_resumen_semanal ORDER BY sector_nombre"
      ),
      pool.query(
        "SELECT ejecutado_en, archivos_procesados, filas_agregadas, avisos, rango_fechas FROM evaluaciones_sync_log ORDER BY ejecutado_en DESC LIMIT 1"
      ),
    ]);
    return res.json({ sectores: resumen.rows, ultima_sincronizacion: sync.rows[0] || null });
  } catch (err) {
    console.error("GET /api/sectores/resumen error", err);
    return res.status(500).json({ error: "No se pudo cargar el resumen de sectores." });
  }
});
 
router.get("/detalle-diario", async (req, res) => {
  try {
    const { sector } = req.query;
    let result;
    const cols =
      "to_char(fecha, 'YYYY-MM-DD') AS fecha, sector_id, sector_nombre, labor, control_calidad, supervisores, lotes, plantas_evaluadas, racimos_evaluados, total_errores, pct_error";
    if (sector) {
      result = await pool.query(
        `SELECT ${cols} FROM evaluaciones_detalle_diario WHERE sector_id = $1 ORDER BY fecha DESC, control_calidad`,
        [sector]
      );
    } else {
      result = await pool.query(
        `SELECT ${cols} FROM evaluaciones_detalle_diario ORDER BY fecha DESC, sector_nombre, control_calidad`
      );
    }
    return res.json({ detalle: result.rows });
  } catch (err) {
    console.error("GET /api/sectores/detalle-diario error", err);
    return res.status(500).json({ error: "No se pudo cargar el detalle diario." });
  }
});
 
router.get("/avance-responsable", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        control_calidad,
        COUNT(DISTINCT fecha) AS dias_trabajados,
        STRING_AGG(DISTINCT sector_nombre, ', ' ORDER BY sector_nombre) AS sectores,
        STRING_AGG(DISTINCT labor, ', ' ORDER BY labor) AS labores,
        SUM(plantas_evaluadas) AS plantas_evaluadas,
        SUM(racimos_evaluados) AS racimos_evaluados,
        SUM(total_errores) AS total_errores
      FROM evaluaciones_detalle_diario
      GROUP BY control_calidad
      ORDER BY control_calidad
    `);
    const filas = result.rows.map((r) => {
      const racimos = r.racimos_evaluados === null ? null : Number(r.racimos_evaluados);
      const errores = Number(r.total_errores);
      const pct = racimos ? Math.round((errores / racimos) * 10000) / 100 : null;
      return { ...r, plantas_evaluadas: Number(r.plantas_evaluadas), racimos_evaluados: racimos, total_errores: errores, pct_error: pct, dias_trabajados: Number(r.dias_trabajados) };
    });
    return res.json({ avance: filas });
  } catch (err) {
    console.error("GET /api/sectores/avance-responsable error", err);
    return res.status(500).json({ error: "No se pudo calcular el avance por responsable." });
  }
});
 
module.exports = router;
 
