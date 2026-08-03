// Глобальные переменные и константы
let BEACHES = [];
let NC_DATA = null;
let OMEGA_DATA = null;

const S = {
    currentBeach: 9, // Пляж Омега по умолчанию
    currentLayer: 'satellite',
    tempData: [],
    reviews: JSON.parse(localStorage.getItem('bs_reviews') || '[]'),
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth() + 1,
    omegaLoaded: false,
    map: null,
    placemarks: {},
    rating: 0
};

// Переменные для карты
let omegaBayMap = null, omegaStationMarks = [], omegaIsolineLayer = null;
let mapLayer = null, currentArrows = [], routeLine = null, awardPlacemarks = [];

// Переменные для 3D
let scene3d, camera3d, renderer3d, mesh3d, beachMarkers3d = [], animId3d = null;
let curDepthIdx3d = 0, zScale = 8;

// Изображения слоёв
// ВАЖНО: для Yandex Maps лучше использовать same-origin картинки (GitHub Pages / локальный сервер),
// иначе внешние URL могут не отрисоваться из-за CORS и будут видны "белые прямоугольники".
const LAYER_IMGS = {
    satellite: 'data/satellite.png',
    model3d: 'data/model3d.png',
    daily: 'data/daily.png',
    salinity: 'data/salinity.png'
};
