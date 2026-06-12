const URL_SAFE_ID = /^[a-z][a-z0-9-]*$/;

export function validatePlugin(p) {
  if (!p || typeof p !== 'object') throw new Error('plugin: not an object');
  if (typeof p.id !== 'string' || !URL_SAFE_ID.test(p.id)) {
    throw new Error(`plugin.id must be url-safe (lowercase letters, digits, hyphens; starts with letter): ${p.id}`);
  }
  if (typeof p.displayName !== 'string' || p.displayName.length === 0) {
    throw new Error(`plugin(${p.id}).displayName must be a non-empty string`);
  }
  const pl = p.players;
  if (!pl || typeof pl !== 'object'
      || !Number.isInteger(pl.min) || !Number.isInteger(pl.max)
      || pl.min < 2 || pl.max < pl.min || pl.max > 6) {
    throw new Error(`plugin(${p.id}).players must be {min, max} with 2 <= min <= max <= 6; got ${JSON.stringify(pl)}`);
  }
  if (typeof p.clientDir !== 'string' || p.clientDir.length === 0) {
    throw new Error(`plugin(${p.id}).clientDir must be a non-empty string`);
  }
  for (const fn of ['initialState', 'applyAction', 'publicView']) {
    if (typeof p[fn] !== 'function') {
      throw new Error(`plugin(${p.id}).${fn} must be a function`);
    }
  }
  if (p.legalActions !== undefined && typeof p.legalActions !== 'function') {
    throw new Error(`plugin(${p.id}).legalActions must be a function if present`);
  }
  if (p.auxRoutes !== undefined) {
    if (typeof p.auxRoutes !== 'object' || p.auxRoutes === null || Array.isArray(p.auxRoutes)) {
      throw new Error(`plugin(${p.id}).auxRoutes must be a plain object`);
    }
    for (const [name, route] of Object.entries(p.auxRoutes)) {
      if (!URL_SAFE_ID.test(name)) {
        throw new Error(`plugin(${p.id}).auxRoutes['${name}']: route name must be url-safe`);
      }
      if (typeof route?.method !== 'string') throw new Error(`plugin(${p.id}).auxRoutes['${name}'].method missing`);
      if (typeof route?.handler !== 'function') throw new Error(`plugin(${p.id}).auxRoutes['${name}'].handler must be a function`);
    }
  }
  return p;
}

export function buildRegistry(pluginMap) {
  const out = {};
  for (const [id, plugin] of Object.entries(pluginMap)) {
    if (id !== plugin.id) {
      throw new Error(`registry key '${id}' does not match plugin.id '${plugin.id}'`);
    }
    validatePlugin(plugin);
    out[id] = plugin;
  }
  return out;
}

export function getPlugin(registry, gameType) {
  const p = registry[gameType];
  if (!p) throw new Error(`unknown game_type: ${gameType}`);
  return p;
}
