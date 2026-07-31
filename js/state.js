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

// Изображения слоёв (заглушки - замените на реальные URL)
const LAYER_IMGS = {
    satellite: 'https://via.placeholder.com/800x600/000033/00b4d8?text=GHRSST+Satellite',
    model3d: 'https://via.placeholder.com/800x600/003300/22c55e?text=BAMS+3D',
    daily: 'https://via.placeholder.com/800x600/330000/FF9800?text=BAMS+Daily',
    salinity: 'https://via.placeholder.com/800x600/000033/00b4d8?text=Salinity'
};