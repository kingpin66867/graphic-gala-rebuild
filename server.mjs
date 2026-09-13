import { createApp } from './src/app.mjs';
const app = createApp();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
app.server.listen(port, host, () => console.log(`Graphic Gala is running at ${process.env.APP_ORIGIN || `http://localhost:${port}`}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.db.close(); process.exit(0); }));
