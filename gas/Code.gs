/**
 * Halal Plane Google Apps Script
 *
 * Deploy:
 * 1. Google Sheet -> Extensions -> Apps Script
 * 2. Paste this file
 * 3. Deploy -> New deployment -> Web app
 * 4. Execute as: Me / Who has access: Anyone
 * 5. Copy deployment URL into index.html GAS_URL
 */

const REQUESTS_SHEET_NAME = 'Requests';

function doGet(e) {
  return handleRequest_(e.parameter || {});
}

function doPost(e) {
  const params = Object.assign({}, e.parameter || {});

  if (e.postData && e.postData.type === 'application/json') {
    try {
      const body = JSON.parse(e.postData.contents || '{}');
      Object.assign(params, body);
    } catch (error) {
      return jsonResponse_({ ok: false, error: 'Invalid JSON body' });
    }
  }

  return handleRequest_(params);
}

function handleRequest_(params) {
  const action = (params.action || 'data').toLowerCase();

  if (action === 'data') {
    return jsonResponse_({ ok: true, places: readPlaces_() });
  }

  if (action === 'add') {
    return jsonResponse_(addPlaceRequest_(params.name, params.country));
  }

  return jsonResponse_({ ok: false, error: 'Unknown action: ' + action });
}

function readPlaces_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];

  const headers = values[0].map(function (header) {
    return String(header || '').trim();
  });

  return values.slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return String(cell || '').trim() !== '';
      });
    })
    .map(function (row) {
      const place = {};
      headers.forEach(function (header, index) {
        if (header) place[header] = row[index];
      });
      return place;
    })
    .filter(function (place) {
      return place.Country;
    });
}

function addPlaceRequest_(name, country) {
  if (!name || !country) {
    return { ok: false, error: 'name and country are required' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REQUESTS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(REQUESTS_SHEET_NAME);
    sheet.appendRow(['timestamp', 'name', 'country', 'status']);
  }

  sheet.appendRow([
    new Date().toISOString(),
    String(name).trim(),
    String(country).trim(),
    'pending'
  ]);

  return {
    ok: true,
    message: 'Request saved',
    name: String(name).trim(),
    country: String(country).trim()
  };
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
