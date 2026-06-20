// map_links.js — precise map links by country (Google / Naver / Baidu)

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

function buildGoogleLink(place, country) {
    if (hasValidCoords(place)) {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    }

    const query = [place.address, place.name, country].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildNaverLink(place) {
    if (hasValidCoords(place)) {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        const title = encodeURIComponent(place.name_ko || place.name || "Place");
        return `https://map.naver.com/?lng=${lon}&lat=${lat}&title=${title}&zoom=17`;
    }

    const query = place.name_ko || place.name || place.address;
    return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

function buildBaiduLink(place, country) {
    if (hasValidCoords(place)) {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        const [bdLat, bdLng] = wgs84ToBd09(lat, lon);
        const title = encodeURIComponent(place.name_ko || place.name || "Place");
        const content = encodeURIComponent([place.address, country].filter(Boolean).join(", "));
        return `https://api.map.baidu.com/marker?location=${bdLat},${bdLng}&title=${title}&content=${content}&output=html&src=halalplane`;
    }

    const query = [place.name, place.name_ko, place.address, country].filter(Boolean).join(" ");
    return `https://map.baidu.com/search/${encodeURIComponent(query)}/`;
}

export function buildMapLink(place, country = "") {
    const resolvedCountry = country || place.Country || place.origin_country || "";

    if (isKorea(resolvedCountry)) return buildNaverLink(place);
    if (isChina(resolvedCountry)) return buildBaiduLink(place, resolvedCountry);
    return buildGoogleLink(place, resolvedCountry);
}

export function buildExternalMapLink(name, country = "") {
    const place = { name, address: "" };
    return buildMapLink(place, country);
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
            const query = parsed.searchParams.get("query");
            if (query && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(query)) {
                return null;
            }
            if (query) return decodeURIComponent(query.replace(/\+/g, " "));
        }

        if (parsed.hostname.includes("naver.com")) {
            const title = parsed.searchParams.get("title");
            if (title) return decodeURIComponent(title);
        }

        if (parsed.hostname.includes("baidu.com")) {
            const title = parsed.searchParams.get("title");
            if (title) return decodeURIComponent(title);
            const parts = parsed.pathname.split("/").filter(Boolean);
            if (parts[0] === "search" && parts[1]) {
                return decodeURIComponent(parts[1]);
            }
        }
    } catch (error) {
        console.warn(error);
    }

    return null;
}

export const MAP_URL_PATTERN = /https:\/\/(?:www\.)?(?:google\.com\/maps|map\.baidu\.com|api\.map\.baidu\.com)[^\s)\]"']+/gi;
