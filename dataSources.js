// Live data for the playground merchant routes (/api/weather, /api/market-data).
//
// STABILITY MODEL: x402 settles payment BEFORE the route handler produces the
// body, so the handler must never block on a third party. We never fetch
// upstream inside a request — a background timer refreshes an in-memory cache
// every ~60s and handlers only read memory (instant, synchronous, never fails).
// On any refresh failure we keep the last-known-good value; the cache is seeded
// with the original hardcoded values, so before the first successful refresh —
// or if upstream is unreachable, or if LIVE_DATA_ENABLED=false — behavior is
// identical to the previous hardcoded version.

'use strict';

const config = require('./config');
const { log } = require('./helpers');

// --- generic refreshable cache ---------------------------------------------

function createCache({ seed, refresh, intervalMs, label }) {
  let value = seed;
  let inFlight = false;

  async function doRefresh() {
    if (inFlight) return; // never overlap/pile up
    inFlight = true;
    try {
      const next = await refresh();
      if (next) value = next; // only overwrite on a good result
    } catch (err) {
      // Keep the last-known-good value; a failed refresh must never throw.
      log('DATA', `${label} refresh failed (serving last value): ${err.message}`);
    } finally {
      inFlight = false;
    }
  }

  if (config.liveDataEnabled) {
    void doRefresh(); // non-blocking warm-up; boot is never delayed
    const timer = setInterval(doRefresh, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  return { get: () => value };
}

// --- helpers ----------------------------------------------------------------

const FETCH_TIMEOUT_MS = 8000;

async function getJson(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

const round = (n) => Math.round(n);
const round1 = (n) => Math.round(n * 10) / 10;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const degToCompass = (deg) => COMPASS[Math.round(deg / 45) % 8];

// WMO weather interpretation codes → human-readable conditions.
const WMO = {
  0: 'Clear',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  56: 'Freezing Drizzle',
  57: 'Freezing Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  66: 'Freezing Rain',
  67: 'Freezing Rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Rain Showers',
  81: 'Rain Showers',
  82: 'Heavy Rain Showers',
  85: 'Snow Showers',
  86: 'Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};
const wmo = (code) => WMO[code] || 'Unknown';

// --- weather (Open-Meteo, São Paulo, free / no key) -------------------------

const WEATHER_SEED = {
  city: 'São Paulo',
  temp_c: 24,
  feels_like_c: 26,
  conditions: 'Partly Cloudy',
  humidity: 63,
  wind: { speed_kmh: 12, direction: 'NE' },
  forecast: [
    { day: 'Tomorrow', high: 27, low: 19, conditions: 'Sunny' },
    { day: 'In 2 days', high: 25, low: 18, conditions: 'Partly Cloudy' },
    { day: 'In 3 days', high: 22, low: 17, conditions: 'Rain Showers' },
  ],
  timestamp: new Date().toISOString(),
};

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=-23.55&longitude=-46.63' +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m' +
  '&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=4';

const FORECAST_LABELS = ['Tomorrow', 'In 2 days', 'In 3 days'];

async function refreshWeather() {
  const d = await getJson(WEATHER_URL);
  const c = d.current;
  const daily = d.daily;
  if (!c || !daily) throw new Error('unexpected Open-Meteo shape');

  // daily index 0 is today; forecast uses the next three days (1..3).
  const forecast = FORECAST_LABELS.map((day, i) => {
    const idx = i + 1;
    return {
      day,
      high: round(daily.temperature_2m_max[idx]),
      low: round(daily.temperature_2m_min[idx]),
      conditions: wmo(daily.weather_code[idx]),
    };
  });

  return {
    city: 'São Paulo',
    temp_c: round(c.temperature_2m),
    feels_like_c: round(c.apparent_temperature),
    conditions: wmo(c.weather_code),
    humidity: round(c.relative_humidity_2m),
    wind: {
      speed_kmh: round(c.wind_speed_10m),
      direction: degToCompass(c.wind_direction_10m),
    },
    forecast,
    timestamp: new Date().toISOString(),
  };
}

// --- market data (CoinGecko, free / no key) ---------------------------------

const MARKET_SEED = {
  base: 'USD',
  prices: {
    HTR: { price: 0.041, change_24h_pct: 3.4 },
    BTC: { price: 104250.0, change_24h_pct: -1.2 },
    ETH: { price: 5230.5, change_24h_pct: 0.8 },
  },
  updated_at: new Date().toISOString(),
};

const MARKET_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=hathor,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

async function refreshMarket() {
  const d = await getJson(MARKET_URL);
  if (!d.hathor || !d.bitcoin || !d.ethereum) {
    throw new Error('unexpected CoinGecko shape');
  }
  const coin = (c) => ({
    price: c.usd,
    change_24h_pct: round1(c.usd_24h_change),
  });
  return {
    base: 'USD',
    prices: {
      HTR: coin(d.hathor),
      BTC: coin(d.bitcoin),
      ETH: coin(d.ethereum),
    },
    updated_at: new Date().toISOString(),
  };
}

// --- caches -----------------------------------------------------------------

const weatherCache = createCache({
  seed: WEATHER_SEED,
  refresh: refreshWeather,
  intervalMs: config.liveDataRefreshMs,
  label: 'weather',
});

const marketCache = createCache({
  seed: MARKET_SEED,
  refresh: refreshMarket,
  intervalMs: config.liveDataRefreshMs,
  label: 'market-data',
});

module.exports = {
  getWeather: () => weatherCache.get(),
  getMarketData: () => marketCache.get(),
};
