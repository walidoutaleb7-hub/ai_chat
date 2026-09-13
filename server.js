/* ==========================================
   WEURA AI — Local Development Server (server.js)
   ========================================== */

const app = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`WEURA AI Server running on http://localhost:${PORT}`);
});
