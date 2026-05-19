import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { getGameById } from './games.js';

export function mountPluginClients(app, { db, registry, ai = null }) {
  for (const plugin of Object.values(registry)) {
    const base = `/play/${plugin.id}`;

    // Per-plugin middleware: validate game_type and membership.
    // Identity middleware (req.user) runs before this.
    app.use(`${base}/:gameId`, (req, res, next) => {
      const id = Number(req.params.gameId);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).end();
      const game = getGameById(db, id);
      if (!game) return res.status(404).end();
      if (game.gameType !== plugin.id) return res.status(404).end();
      if (req.user.id !== game.playerAId && req.user.id !== game.playerBId) {
        return res.status(403).end();
      }
      req.game = game;
      next();
    });

    // Bare directory + trailing-slash variants for index.html with injection
    app.get(`${base}/:gameId`, (req, res, next) => {
      if (!req.path.endsWith('/')) return res.redirect(301, req.path + '/');
      return serveIndex(plugin.clientDir, db, req, res, ai);
    });
    app.get(`${base}/:gameId/`, (req, res) => serveIndex(plugin.clientDir, db, req, res, ai));
    app.get(`${base}/:gameId/index.html`, (req, res) => serveIndex(plugin.clientDir, db, req, res, ai));

    // Static assets (everything else under the path)
    app.use(`${base}/:gameId`, express.static(plugin.clientDir, { index: false }));
  }
}

function serveIndex(clientDir, db, req, res, ai = null) {
  const indexPath = path.join(clientDir, 'index.html');
  let html;
  try { html = fs.readFileSync(indexPath, 'utf8'); }
  catch { return res.status(500).end('plugin index.html missing'); }

  const opponentId = req.game.playerAId === req.user.id ? req.game.playerBId : req.game.playerAId;
  const opponentRow = db.prepare('SELECT id, friendly_name, color, glyph, is_bot FROM users WHERE id = ?').get(opponentId);
  const opponent = opponentRow ? {
    id: opponentRow.id, friendlyName: opponentRow.friendly_name,
    color: opponentRow.color, glyph: opponentRow.glyph, is_bot: opponentRow.is_bot === 1,
  } : null;

  let personaOverlay = null;
  if (ai && opponent && opponent.is_bot) {
    const sess = db.prepare("SELECT persona_id FROM ai_sessions WHERE game_id = ?").get(req.game.id);
    if (sess) personaOverlay = ai.personas?.get(sess.persona_id) ?? null;
  }

  const ctx = {
    gameId: req.game.id,
    userId: req.user.id,
    gameType: req.game.gameType,
    sseUrl: `/api/games/${req.game.id}/events`,
    actionUrl: `/api/games/${req.game.id}/action`,
    stateUrl: `/api/games/${req.game.id}`,
    yourFriendlyName: req.user.friendlyName,
    yourGlyph: req.user.glyph ?? null,
    yourColor: req.user.color ?? null,
    opponentFriendlyName: personaOverlay?.displayName ?? opponent?.friendlyName ?? 'Opponent',
    opponentGlyph: personaOverlay?.glyph ?? opponent?.glyph ?? null,
    opponentColor: personaOverlay?.color ?? opponent?.color ?? null,
    opponentPersonaId: personaOverlay?.id ?? null,
  };
  const inject = `<script>window.__GAME__ = ${JSON.stringify(ctx)};</script>`;

  const cacheBusted = bustAssetUrls(html, clientDir);

  let injected;
  if (/<\/head>/i.test(cacheBusted)) {
    injected = cacheBusted.replace(/<\/head>/i, inject + '</head>');
  } else if (/<body[^>]*>/i.test(cacheBusted)) {
    injected = cacheBusted.replace(/<body[^>]*>/i, m => inject + m);
  } else {
    injected = inject + cacheBusted;
  }
  // Per-game HTML carries an injected window.__GAME__ context (game id,
  // user id, urls). Caching it would let a stale gameId surface in a
  // browser tab the user revisits, and any future client-asset path
  // change would persist for cached tabs until manual hard-reload.
  res.set('Cache-Control', 'no-store');
  res.type('html').send(injected);
}

// Rewrite <script src="…"> and <link href="…"> to ?v=<mtime-ms> for
// same-origin relative assets that live in the plugin's client dir.
// Stale module caches (browser or CDN) silently strand users on the
// pre-React app.js after a bundle swap — versioning the URL forces a
// fresh fetch on every rebuild.
function bustAssetUrls(html, clientDir) {
  const stamp = (url) => {
    if (!url || /^(?:[a-z]+:|\/\/|data:|#)/i.test(url)) return url;
    const qIdx = url.indexOf('?');
    const pathPart = qIdx === -1 ? url : url.slice(0, qIdx);
    // Only stamp paths that resolve inside the plugin's client dir.
    if (pathPart.startsWith('/')) return url;
    const fullPath = path.join(clientDir, pathPart);
    let mtime;
    try { mtime = fs.statSync(fullPath).mtimeMs; }
    catch { return url; }
    const v = `v=${Math.floor(mtime)}`;
    return qIdx === -1 ? `${url}?${v}` : `${url}&${v}`;
  };
  return html
    .replace(/(<script\b[^>]*\bsrc=)(["'])([^"']+)\2/gi,
      (_, pre, q, url) => `${pre}${q}${stamp(url)}${q}`)
    .replace(/(<link\b[^>]*\bhref=)(["'])([^"']+)\2/gi,
      (_, pre, q, url) => `${pre}${q}${stamp(url)}${q}`);
}
