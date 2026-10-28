// ==========================================================
// SEEMYDRIVER FLEET COMMAND — BACK-END & TELEMETRY ENGINE
// ==========================================================
(function () {
'use strict';

const $ = (id) => document.getElementById(id);

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAfT3ZCE8DEmjsf4FLIqDgdYIQL1woIJOI",
    authDomain: "seemydriver-prod.firebaseapp.com",
    databaseURL: "https://seemydriver-prod-default-rtdb.firebaseio.com",
    projectId: "seemydriver-prod",
    storageBucket: "seemydriver-prod.firebasestorage.app",
    messagingSenderId: "16366013329",
    appId: "1:16366013329:web:7e993e6ee37f940a04a064"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// --- MAPBOX VECTOR INITIALIZATION ---
mapboxgl.accessToken = 'pk.eyJ1Ijoic29ubnyqb25lczIwMTQiLCJhIjoiY212NHExMmxjMTBmODJ3cHh5cmcxbmZyZSJ9.wq8EANp8vooYz3gE2o4Krg';

let map;
let activeMarkers = {}; // holds Mapbox Marker instances keyed by sessionId
let activePolylines = {}; // holds active route lines if selected
let fleetData = {};

function initFleetCommandMap() {
    if (typeof mapboxgl === 'undefined' || $('map')._mapbox) return;

    // Initialize Mapbox GL Vector Map centered near Houston/Humble
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-95.2831, 29.9731], // [lng, lat]
        zoom: 12
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
        initFirebaseFleetListener();
    });
}

// --- REAL-TIME FIREBASE FLEET LISTENER ---
function initFirebaseFleetListener() {
    const broadcastsRef = db.ref('broadcasts');

    broadcastsRef.on('value', (snapshot) => {
        const val = snapshot.val();
        fleetData = val || {};
        renderFleetRosterAndMarkers();
    }, (error) => {
        console.error("Firebase fleet sync error:", error);
        const statusEl = $('connection-status');
        if (statusEl) {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Disconnected';
            statusEl.className = 'text-xs font-mono text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20 flex items-center gap-1.5';
        }
    });
}

// --- YOUR EXACT UNTOUCHED SOLO APP TRUCK SVG ASSET ---
function createTruckElement(accentColor) {
    const el = document.createElement('div');
    el.className = 'pro-vehicle-marker';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.cursor = 'pointer';
    el.style.filter = 'drop-shadow(0px 6px 12px rgba(0,0,0,0.6))';
    el.innerHTML = `
        <svg viewBox="0 0 24 36" width="32" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.5" y="9" width="3.5" height="7" rx="1" fill="#090d16" stroke="${accentColor}" stroke-width="1"/>
            <rect x="19" y="9" width="3.5" height="7" rx="1" fill="#090d16" stroke="${accentColor}" stroke-width="1"/>
            <rect x="1.5" y="25" width="3.5" height="7" rx="1" fill="#090d16" stroke="${accentColor}" stroke-width="1"/>
            <rect x="19" y="25" width="3.5" height="7" rx="1" fill="#090d16" stroke="${accentColor}" stroke-width="1"/>
            <rect x="4" y="12" width="16" height="21" rx="2.5" fill="#0b0f19" stroke="${accentColor}" stroke-width="1.5"/>
            <rect x="4" y="21" width="16" height="3.5" fill="#fbbf24"/>
            <line x1="4" y1="22.75" x2="20" y2="22.75" stroke="#ffffff" stroke-width="0.75" opacity="0.8"/>
            <path d="M6 12H18V5.5C18 3.84315 16.6569 2.5 15 2.5H9C7.34315 2.5 6 3.84315 6 5.5V12Z" fill="#111827" stroke="#4b5563" stroke-width="1.5"/>
            <path d="M7.5 8H16.5L15.5 4.5H8.5L7.5 8Z" fill="#38bdf8" fill-opacity="0.9" stroke="#bae6fd" stroke-width="0.5"/>
            <line x1="9" y1="6" x2="15" y2="6" stroke="#ffffff" stroke-width="0.75" opacity="0.6"/>
            <circle cx="7" cy="3.5" r="1.1" fill="#fbbf24"/>
            <circle cx="17" cy="3.5" r="1.1" fill="#fbbf24"/>
            <circle cx="7" cy="3.5" r="0.5" fill="#ffffff"/>
            <circle cx="17" cy="3.5" r="0.5" fill="#ffffff"/>
        </svg>
    `;
    return el;
}

// --- RENDER LIVE ROSTER & MAPBOX MARKERS ---
function renderFleetRosterAndMarkers() {
    const listContainer = $('driver-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const sessionIds = Object.keys(fleetData);
    const activeSessions = sessionIds.filter(id => {
        const d = fleetData[id];
        return d && !d.ended && isFinite(d.lat) && isFinite(d.lng);
    });

    const countEl = $('driver-count');
    if (countEl) countEl.innerText = `${activeSessions.length} Active`;

    if (activeSessions.length === 0) {
        listContainer.innerHTML = '<div class="text-xs text-neutral-500 text-center py-8 font-mono">Listening for active broadcasts...<br><span class="text-amber-400">Start a broadcast on your phone app!</span></div>';
        Object.keys(activeMarkers).forEach(id => {
            activeMarkers[id].marker.remove();
            delete activeMarkers[id];
        });
        return;
    }

    const currentMarkerIds = new Set(activeSessions);
    Object.keys(activeMarkers).forEach(id => {
        if (!currentMarkerIds.has(id)) {
            activeMarkers[id].marker.remove();
            delete activeMarkers[id];
        }
    });

    activeSessions.forEach((sid, index) => {
        const driver = fleetData[sid];
        const accentColors = ['#fbbf24', '#3b82f6', '#10b981', '#f43f5e', '#a855f7'];
        const color = accentColors[index % accentColors.length];

        // 1. Build Sidebar Card
        const card = document.createElement('div');
        card.className = `bg-[#12141c] hover:bg-[#161923] border border-neutral-800 p-4 rounded-2xl cursor-pointer transition-all shadow-lg flex flex-col gap-2`;
        card.style.borderLeft = `4px solid ${color}`;
        card.onclick = () => selectDriver(sid);
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-black text-white text-sm flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full" style="background: ${color};"></span>
                    ${driver.driverName || 'Active Driver'}
                </span>
                <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">En Route</span>
            </div>
            <p class="text-xs text-neutral-400 font-medium truncate">Dest: ${driver.destAddress || 'Custom Destination'}</p>
            <div class="flex items-center justify-between text-xs font-mono text-neutral-400 pt-1 border-t border-neutral-800/60">
                <span>Speed: <strong style="color: ${color};">${driver.speed || 0} mph</strong></span>
                <span>Live Telemetry</span>
            </div>
        `;
        listContainer.appendChild(card);

        // 2. Update or Create Mapbox Marker
        const lngLat = [driver.lng, driver.lat];
        const popupHtml = `<b style="color:${color}; font-size:14px;">${driver.driverName || 'Driver'}</b><br><span style="color:#a3a3a3">Speed: ${driver.speed || 0} mph</span><br>Dest: <b>${driver.destAddress || 'N/A'}</b>`;

        if (activeMarkers[sid]) {
            activeMarkers[sid].marker.setLngLat(lngLat);
            activeMarkers[sid].marker.getPopup().setHTML(popupHtml);
        } else {
            const el = createTruckElement(color);
            const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml);
            const marker = new mapboxgl.Marker(el)
                .setLngLat(lngLat)
                .setPopup(popup)
                .addTo(map);

            el.addEventListener('click', () => selectDriver(sid));
            activeMarkers[sid] = { marker, driver };
        }
    });
}

// --- SELECT DRIVER (ZOOM & FLY) ---
window.selectDriver = function(sid) {
    const data = activeMarkers[sid] || fleetData[sid];
    if (!data) return;
    const driver = data.driver || data;

    map.flyTo({
        center: [driver.lng, driver.lat],
        zoom: 15,
        essential: true,
        duration: 1200
    });

    if (activeMarkers[sid] && activeMarkers[sid].marker) {
        activeMarkers[sid].marker.togglePopup();
    }
};

// --- RESET VIEW BACK TO OVERVIEW ---
window.resetFleetView = function() {
    map.flyTo({
        center: [-95.2831, 29.9731],
        zoom: 12,
        essential: true,
        duration: 1000
    });
};

window.openAddDriverModal = function() {
    alert("Add Driver onboarding modal ready to wire up.");
};

document.addEventListener('DOMContentLoaded', initFleetCommandMap);

})();