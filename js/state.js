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
  ncLoaded: false,   // загружен ли data/nc_data.json
  ncDate: null,      // дата данных МГИ
  graphDemo: false,  // график из демо-набора
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

// ВНИМАНИЕ: никаких placeholder-картинок. Слои рисуются из сеток NC_DATA
// (buildGridCanvas) или интерполяцией по точкам (buildIdwCanvas) — см. utils.js/map.js
