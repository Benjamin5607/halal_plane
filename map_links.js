// map_links.js — map links by country (name/address search, coord-biased)

export function isKorea(country = "") {
    const value = String(country).toLowerCase();
    return value.includes("korea") || value.includes("한국") || value.includes("south korea");
}

export function isChina(country = "") {
    const value = String(country).toLowerCase();
    return value.includes("china") || value.includes("中国") || value.includes("중국");
}

export function hasValidCoords(place = {}) {
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function wgs84ToBd09(lat, lon) {
    const x = lon;
    const y = lat;
    const z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * Math.PI * 3000.0 / 180.0);
    const theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * Math.PI * 3000.0 / 180.0);
    const bdLng = z * Math.cos(theta) + 0.0065;
    const bdLat = z * Math.sin(theta) + 0.006;
    return [bdLat, bdLng];
}

/** Build the richest possible text query from DB fields (never raw coordinates). */
export function buildSearchQuery(place = {}, country = "") {
    const parts = [];

    if (place.name_ko) parts.push(String(place.name_ko).trim());
    if (place.name && place.name !== place.name_ko) parts.push(String(place.name).trim());
    if (place.address) parts.push(String(place.address).trim());

    if (!place.address && country) parts.push(String(country).trim());

    const query = parts.filter(Boolean).join(" ");
    return query || String(place.name || country || "restaurant").trim();
}

function buildGoogleLink(place, country) {
    const query = buildSearchQuery(place, country);

    if (hasValidCoords(place)) {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        // Search by name/address, map centered near DB coordinates
        return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lon},17z`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildNaverLink(place, country) {
    const query = buildSearchQuery(place, country);

    if (hasValidCoords(place)) {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        // v5 search with map center at DB coordinates
        return `https://map.naver.com/v5/search/${encodeURIComponent(query)}?c=${lon},${lat},17,0,0,0,dh`;
    }

    return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

function buildBaiduLink(place, country) {
    const query = buildSearchQuery(place, country);

    if (hasValidCoords(place)) {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        const [bdLat, bdLng] = wgs84ToBd09(lat, lon);
        // Search by name/address near converted BD-09 coordinates
        return `https://map.baidu.com/search/${encodeURIComponent(query)}/@${bdLng},${bdLat},19z`;
    }

    return `https://map.baidu.com/search/${encodeURIComponent(query)}/`;
}

export function buildMapLink(place, country = "") {
    const resolvedCountry = country || place.Country || place.origin_country || "";

    if (isKorea(resolvedCountry)) return buildNaverLink(place, resolvedCountry);
    if (isChina(resolvedCountry)) return buildBaiduLink(place, resolvedCountry);
    return buildGoogleLink(place, resolvedCountry);
}

export function buildExternalMapLink(name, country = "") {
    return buildMapLink({ name, address: "" }, country);
}

export function getMapProvider(country = "") {
    if (isKorea(country)) return "naver";
    if (isChina(country)) return "baidu";
    return "google";
}

export function getMapProviderLabel(country = "", lang = "EN") {
    const provider = getMapProvider(country);
    const labels = {
        google: { KO: "Google Maps", EN: "Google Maps", JP: "Google Maps", CN: "Google Maps" },
        naver: { KO: "네이버 지도", EN: "Naver Map", JP: "Naver Map", CN: "Naver Map" },
        baidu: { KO: "바이두 지도", EN: "Baidu Maps", JP: "Baidu Maps", CN: "百度地图" }
    };
    return labels[provider][lang] || labels[provider].EN;
}

export function extractMapLinkLabel(url) {
    try {
        const parsed = new URL(url);

        if (parsed.hostname.includes("google.com")) {
            const pathMatch = parsed.pathname.match(/\/maps\/search\/([^/@]+)/);
            if (pathMatch) return decodeURIComponent(pathMatch[1].replace(/\+/g, " "));

            const query = parsed.searchParams.get("query");
            if (query && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(query)) {
                return decodeURIComponent(query.replace(/\+/g, " "));
            }
        }

        if (parsed.hostname.includes("naver.com")) {
            const pathMatch = parsed.pathname.match(/\/(?:v5\/)?search\/([^/?]+)/);
            if (pathMatch) return decodeURIComponent(pathMatch[1]);
        }

        if (parsed.hostname.includes("baidu.com")) {
            const pathMatch = parsed.pathname.match(/\/search\/([^/@]+)/);
            if (pathMatch) return decodeURIComponent(pathMatch[1]);
        }
    } catch (error) {
        console.warn(error);
    }

    return null;
}

export const MAP_URL_PATTERN = /https:\/\/(?:www\.)?(?:google\.com\/maps|map\.baidu\.com|map\.naver\.com)[^\s)\]"']+/gi;
