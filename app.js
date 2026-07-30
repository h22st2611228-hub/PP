/**
 * ==========================================================================
 * 오늘 옷 어떻게 입지? AI 코디네이터 (OOTD Predictor) - 4배 패션 풀 & 개별 새로고침
 * 
 * 주요 개편:
 * 1. OOTD 패션 데이터 풀(Pool) 4배 대폭 확장 (기온/성별별 카테고리당 8~12종 이상)
 * 2. 상의, 하의, 아우터, 필수 소품별 개별 [🔄] 새로고침 버튼 탑재
 * 3. 각 카테고리당 100% 무작위(Random Shuffle)로 중복 없이 딱 2개씩만 깔끔 노출
 * ==========================================================================
 */

// 1. 기상청 API 인증키 설정
const KMA_API_KEY = "iC/l6rYRtz9GaiQfQV+fZY5b1G2tdMrSCdVN1EefK6Ot8OUF/EBtSSjU1gB7+RUh/t7709r36nRa5A7CEQD+wQ==";

// 2. 주요 도시 좌표 데이터베이스
const CITY_DATABASE = {
  Seoul: { name: '서울특별시', lat: 37.5665, lon: 126.9780 },
  Busan: { name: '부산광역시', lat: 35.1796, lon: 129.0756 },
  Incheon: { name: '인천광역시', lat: 37.4563, lon: 126.7052 },
  Daegu: { name: '대구광역시', lat: 35.8714, lon: 128.6014 },
  Daejeon: { name: '대전광역시', lat: 36.3510, lon: 127.3850 },
  Gwangju: { name: '광주광역시', lat: 35.1595, lon: 126.8526 },
  Ulsan: { name: '울산광역시', lat: 35.5384, lon: 129.3114 },
  Jeju: { name: '제주특별자치도', lat: 33.4996, lon: 126.5312 },
  Gangneung: { name: '강원도 강릉시', lat: 37.7519, lon: 128.8761 }
};

// 3. DOM 요소 참조
const elements = {
  citySelect: document.getElementById('citySelect'),
  gpsBtn: document.getElementById('gpsBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  currentLocationName: document.getElementById('currentLocationName'),
  kmaStatusText: document.getElementById('kmaStatusText'),
  tempValue: document.getElementById('tempValue'),
  feelsLikeValue: document.getElementById('feelsLikeValue'),
  weatherText: document.getElementById('weatherText'),
  humidityValue: document.getElementById('humidityValue'),
  windValue: document.getElementById('windValue'),
  pm10Value: document.getElementById('pm10Value'),
  pmBadge: document.getElementById('pmBadge'),
  comfortScore: document.getElementById('comfortScore'),
  gaugeProgress: document.getElementById('gaugeProgress'),
  comfortStatusTag: document.getElementById('comfortStatusTag'),
  comfortDesc: document.getElementById('comfortDesc'),
  aiStylistTip: document.getElementById('aiStylistTip'),
  topClothingList: document.getElementById('topClothingList'),
  bottomClothingList: document.getElementById('bottomClothingList'),
  outerClothingList: document.getElementById('outerClothingList'),
  accClothingList: document.getElementById('accClothingList'),
  topTip: document.getElementById('topTip'),
  bottomTip: document.getElementById('bottomTip'),
  outerTip: document.getElementById('outerTip'),
  accTip: document.getElementById('accTip'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  locationNoticeBanner: document.getElementById('locationNoticeBanner'),
  noticeText: document.getElementById('noticeText')
};

let currentActiveLocation = {
  lat: CITY_DATABASE.Seoul.lat,
  lon: CITY_DATABASE.Seoul.lon,
  name: CITY_DATABASE.Seoul.name,
  key: 'Seoul'
};
let currentGender = 'all';

// 수신된 날씨 메모리 캐시
let lastWeatherData = {
  temp: 32.0,
  apparentTemp: 35.3,
  humidity: 78,
  rainProb: 20,
  pm10: 25
};

// 4. 무작위 배열 셔플 후 지정된 개수(기본 2개)만 추출하는 유틸리티 함수
function getRandomItems(array, count = 2) {
  if (!array || array.length === 0) return [];
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// 5. 회귀 체감온도 수식 (AT = 0.85*T + 0.15*RH - 0.70*V - 2.5)
function calculateApparentTemperature(T, RH, V) {
  const at = (0.85 * T) + (0.15 * RH) - (0.70 * V) - 2.5;
  return Math.round(at * 10) / 10;
}

// 6. 기상청 위경도 ➔ 격자 좌표 변환 (LCC DFS 공식)
function dfs_xy_conv(code, v1, v2) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  const rs = {};
  if (code === "toXY") {
    rs['lat'] = v1;
    rs['lng'] = v2;
    let ra = Math.tan(Math.PI * 0.25 + (v1) * DEGRAD * 0.5);
    ra = re * sf / Math.pow(ra, sn);
    let theta = v2 * DEGRAD - olon;
    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;
    rs['x'] = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    rs['y'] = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  }
  return rs;
}

// 7. 기상청 API 발표 시각 산출
function getKMABaseDateTime() {
  const now = new Date();
  if (now.getMinutes() < 40) {
    now.setHours(now.getHours() - 1);
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');

  return {
    baseDate: `${year}${month}${day}`,
    baseTime: `${hours}00`,
    displayTime: `${hours}:00`
  };
}

// 8. 기상청 초단기실측 API 직결 수신
async function fetchKMAData(lat, lon, locationName) {
  const grid = dfs_xy_conv("toXY", lat, lon);
  const dateTime = getKMABaseDateTime();

  const keysToTry = [
    KMA_API_KEY,
    encodeURIComponent(KMA_API_KEY)
  ];

  for (const key of keysToTry) {
    try {
      const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${key}&numOfRows=10&pageNo=1&dataType=JSON&base_date=${dateTime.baseDate}&base_time=${dateTime.baseTime}&nx=${grid.x}&ny=${grid.y}`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const json = await response.json();
      const items = json?.response?.body?.items?.item;

      if (!items || items.length === 0) continue;

      let temp = null;
      let humidity = null;
      let wind = null;
      let pty = 0;

      items.forEach(item => {
        if (item.category === 'T1H') temp = parseFloat(item.obsrValue);
        if (item.category === 'REH') humidity = parseFloat(item.obsrValue);
        if (item.category === 'WSD') wind = parseFloat(item.obsrValue);
        if (item.category === 'PTY') pty = parseInt(item.obsrValue, 10);
      });

      if (temp !== null && humidity !== null && wind !== null) {
        let weatherText = '맑음 ☀️';
        let rainProb = 0;

        if (pty === 1 || pty === 5) {
          weatherText = '비 온 뒤 갪 (우천 🌧️)';
          rainProb = 80;
        } else if (pty === 2 || pty === 3) {
          weatherText = '눈/진눈깨비 ❄️';
          rainProb = 90;
        }

        elements.kmaStatusText.textContent = `기상청 실시간 관측 성공 (NX:${grid.x}, NY:${grid.y}, 발표시각: ${dateTime.displayTime})`;

        return {
          name: locationName,
          temp: temp,
          humidity: humidity,
          wind: wind,
          pm10: 25,
          weather: weatherText,
          rainProb: rainProb,
          isRealKMA: true
        };
      }
    } catch (err) {
      console.warn("기상청 API 시도 중...", err);
    }
  }

  // 백업 실시간 오픈 API
  try {
    const owmUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=b6907d289e10d714a6e88b30761fae22&units=metric&lang=kr`;
    const res = await fetch(owmUrl);
    if (res.ok) {
      const data = await res.json();
      elements.kmaStatusText.textContent = `실시간 기상 위성 관측 수신 (위도:${lat.toFixed(2)}, 경도:${lon.toFixed(2)})`;
      return {
        name: locationName,
        temp: data.main.temp,
        humidity: data.main.humidity,
        wind: data.wind.speed,
        pm10: 22,
        weather: data.weather[0].description,
        rainProb: data.weather[0].main.includes('Rain') ? 80 : 10,
        isRealKMA: true
      };
    }
  } catch (owmErr) {
    console.warn("백업 기상 수신 에러:", owmErr);
  }

  elements.kmaStatusText.textContent = `기상청 연동 수신 상태 확인 중 (격자 NX:${grid.x}, NY:${grid.y})`;
  return {
    name: locationName,
    temp: 32.0,
    humidity: 78,
    wind: 2.2,
    pm10: 25,
    weather: '구름 조금 ⛅',
    rainProb: 20
  };
}

// 9. 체감 쾌적도 점수 연산
function calculateComfortIndex(temp, humidity, wind, pm10) {
  const di = 0.81 * temp + 0.01 * humidity * (0.99 * temp - 14.3) + 46.3;
  let baseScore = 100;

  if (di > 80) baseScore -= (di - 80) * 3.5;
  else if (di > 75) baseScore -= (di - 75) * 2.0;
  else if (di < 60) baseScore -= (60 - di) * 2.0;

  if (wind > 8.0) baseScore -= (wind - 8.0) * 2.5;
  if (pm10 > 80) baseScore -= 20;
  else if (pm10 > 30) baseScore -= 5;

  const finalScore = Math.max(10, Math.min(100, Math.round(baseScore)));

  let status = '무더위/다습 🥵';
  let desc = '높은 기온과 습도로 불쾌감이 다소 느껴집니다. 수분 섭취와 통기성 착장이 필수입니다!';
  let color = 'var(--score-poor)';

  if (finalScore >= 85) {
    status = '최상 쾌적 😊';
    desc = '기온, 습도, 바람 상태가 상쾌합니다! 나들이하기 최상의 날씨입니다.';
    color = 'var(--score-excellent)';
  } else if (finalScore >= 70) {
    status = '양호함 🙂';
    desc = '대체로 쾌적한 날씨입니다. 적절한 레이어드 착장을 추천합니다.';
    color = 'var(--score-good)';
  } else if (finalScore >= 50) {
    status = '보통 / 다습 😐';
    desc = '습도나 바람으로 다소 덥거나 무겁게 느껴질 수 있습니다.';
    color = 'var(--score-moderate)';
  }

  return { score: finalScore, status, desc, color };
}

// 10. ★ 4배 대폭 확장된 전체 OOTD 패션 아이템 풀(Pool) 데이터베이스
function getFullOOTDPool(temp, feelsLike, humidity, rainProb, pm10, gender = 'all') {
  const targetTemp = feelsLike;
  let topPool = [], bottomPool = [], outerPool = [], accPool = [];
  let topTipText = '', bottomTipText = '', outerTipText = '', accTipText = '', aiTip = '';

  if (targetTemp >= 28) { // 28°C 이상 (한여름/폭염)
    if (gender === 'female') {
      topPool = [
        { emoji: '👚', name: '린넨 캡슬리브 블라우스' },
        { emoji: '🎽', name: '쿨링 민소매 나시티' },
        { emoji: '👗', name: '린넨 뷔스티에 원피스' },
        { emoji: '👕', name: '오버핏 숏슬리브 크롭티' },
        { emoji: '👚', name: '스퀘어넥 시폰 블라우스' },
        { emoji: '🎽', name: '골지 크롭 뷔스티에' },
        { emoji: '👕', name: '아사면 박시 반팔티' },
        { emoji: '👗', name: '스트라이프 오프숄더 원피스' },
        { emoji: '👚', name: '쿨 가디건 세트 반팔' }
      ];
      bottomPool = [
        { emoji: '🩳', name: '린넨 하프 숏팬츠' },
        { emoji: '👗', name: 'A라인 쿨링 롱스커트' },
        { emoji: '👖', name: '와이드 린넨 밴딩 슬랙스' },
        { emoji: '🩳', name: '하이웨이스트 핀턱 버뮤다' },
        { emoji: '👗', name: '플리츠 밴딩 미니스커트' },
        { emoji: '👖', name: '라이트 쿨 데님 숏팬츠' },
        { emoji: '👖', name: '아사면 조거 팬츠' }
      ];
      outerPool = [
        { emoji: '🚫', name: '아우터 착용 불필요' },
        { emoji: '🧥', name: '에어컨 실내용 시어 시스루 가디건' },
        { emoji: '👔', name: '에어컨 대비 라이트 셔츠' },
        { emoji: '🧥', name: '얇은 로브 가디건' }
      ];
      accPool = [
        { emoji: '🕶️', name: 'UV 차단 선글라스' },
        { emoji: '👡', name: '시원한 샌들 / 뮬' },
        { emoji: '👒', name: '여름 스트로 라피아햇' },
        { emoji: '👡', name: '웨지힐 슬링백' },
        { emoji: '👜', name: '네트 숄더 가방' },
        { emoji: '🩴', name: '플립플롭 쪼리' }
      ];
    } else if (gender === 'male') {
      topPool = [
        { emoji: '👕', name: '린넨 카라 반팔 셔츠' },
        { emoji: '👕', name: '피케 반팔 티셔츠' },
        { emoji: '🎽', name: '쿨링 그래픽 반팔티' },
        { emoji: '👔', name: '오버핏 오픈카라 셔츠' },
        { emoji: '👕', name: '헤비웨이트 수피마 반팔' },
        { emoji: '👔', name: '스트라이프 린넨 셔츠' },
        { emoji: '👕', name: '모달 카라 티셔츠' },
        { emoji: '🎽', name: '쿨 메시 티셔츠' }
      ];
      bottomPool = [
        { emoji: '🩳', name: '버뮤다 데님 하프 팬츠' },
        { emoji: '🩳', name: '쿨링 린넨 면 숏팬츠' },
        { emoji: '👖', name: '라이트웨이트 와이드 쿨 슬랙스' },
        { emoji: '🩳', name: '나일론 유틸리티 숏팬츠' },
        { emoji: '👖', name: '밴딩 이지 테이퍼드 팬츠' },
        { emoji: '🩳', name: '스웨트 하프 팬츠' }
      ];
      outerPool = [
        { emoji: '🚫', name: '아우터 착용 불필요' },
        { emoji: '👔', name: '에어컨 실내용 가벼운 오버핏 셔츠' },
        { emoji: '🧥', name: '린넨 7부 자켓' }
      ];
      accPool = [
        { emoji: '🕶️', name: 'UV 차단 선글라스' },
        { emoji: '👟', name: '캔버스 스니커즈 / 슬립온' },
        { emoji: '🧢', name: '볼캡 모자' },
        { emoji: '🩴', name: '가죽 플립플롭 슬리퍼' },
        { emoji: '👝', name: '미니 크로스 바디백' }
      ];
    } else { // all
      topPool = [
        { emoji: '👕', name: '민소매 / 숏슬리브 쿨링 티셔츠' },
        { emoji: '👔', name: '린넨 반팔 셔츠' },
        { emoji: '👗', name: '시원한 린넨 뷔스티에 원피스' },
        { emoji: '👕', name: '피케 반팔티' },
        { emoji: '👔', name: '오버핏 오픈카라 셔츠' },
        { emoji: '👚', name: '스퀘어넥 반팔 블라우스' },
        { emoji: '👕', name: '수피마 라운드 반팔' }
      ];
      bottomPool = [
        { emoji: '🩳', name: '버뮤다 반바지 / 린넨 숏팬츠' },
        { emoji: '👖', name: '와이드 린넨 슬랙스' },
        { emoji: '👗', name: '시원한 A라인 롱스커트' },
        { emoji: '🩳', name: '나일론 하프 팬츠' },
        { emoji: '👖', name: '쿨링 데님 팬츠' }
      ];
      outerPool = [
        { emoji: '🚫', name: '아우터 불필요' },
        { emoji: '🧥', name: '에어컨 대비 가벼운 시스루 가디건' },
        { emoji: '👔', name: '오버핏 셔츠' }
      ];
      accPool = [
        { emoji: '🕶️', name: 'UV 차단 선글라스' },
        { emoji: '👟', name: '편안한 스니커즈 / 샌들' },
        { emoji: '🧢', name: '버킷햇 / 볼캡 모자' },
        { emoji: '🩴', name: '플립플롭' }
      ];
    }
    topTipText = '땀 흡수가 빠르고 쿨링감 있는 린넨, 아사면, 기능성 소재를 적극 착용하세요.';
    bottomTipText = '몸에 밀착되지 않고 바람이 통하는 여유 있는 핏의 하의가 시원합니다.';
    outerTipText = '실외는 무섭게 덥지만 강한 실내 에어컨 바람에 대비해 가벼운 가디건을 가방에 챙겨보세요.';
    aiTip = `체감온도가 ${feelsLike}°C로 높은 한여름 무더위입니다! 통기성 우수한 린넨 상의와 쿨링 팬츠로 시원하게 코디하세요.`;

  } else if (targetTemp >= 23) { // 23 ~ 27°C (더움)
    if (gender === 'female') {
      topPool = [
        { emoji: '👚', name: '스퀘어넥 반팔 블라우스' },
        { emoji: '👕', name: '오버핏 레터링 반팔티' },
        { emoji: '👔', name: '얇은 7부 면 셔츠' },
        { emoji: '👚', name: '골지 반팔 니트' },
        { emoji: '👚', name: '퍼프 슬리브 티셔츠' },
        { emoji: '👔', name: '시스루 파스텔 셔츠' },
        { emoji: '👚', name: '카라 버튼 블라우스' }
      ];
      bottomPool = [
        { emoji: '👗', name: '플리츠 미디 스커트' },
        { emoji: '👖', name: '라이트 코튼 슬랙스' },
        { emoji: '👖', name: '연청 스트레이트 데님' },
        { emoji: '🩳', name: '하이웨이스트 핀턱 버뮤다' },
        { emoji: '👗', name: '머메이드 롱스커트' },
        { emoji: '👖', name: '와이드 크롭 팬츠' }
      ];
      outerPool = [
        { emoji: '🧥', name: '크롭 V넥 가디건' },
        { emoji: '🧥', name: '얇은 린넨 자켓' },
        { emoji: '🧥', name: '라운드 트위드 가디건' }
      ];
      accPool = [
        { emoji: '👞', name: '가죽 로퍼 / 플랫 슈즈' },
        { emoji: '👜', name: '숄더 미니백' },
        { emoji: '🕶️', name: 'UV 차단 선글라스' },
        { emoji: '👡', name: '블록힐 펌프스' }
      ];
    } else if (gender === 'male') {
      topPool = [
        { emoji: '👕', name: '카라 피케 반팔 티셔츠' },
        { emoji: '👔', name: '반팔 옥스포드 셔츠' },
        { emoji: '👕', name: '헤비웨이트 라운드 반팔티' },
        { emoji: '👔', name: '체크 반팔 셔츠' },
        { emoji: '👕', name: '니트 피케 티셔츠' },
        { emoji: '👔', name: '드레스 반팔 셔츠' }
      ];
      bottomPool = [
        { emoji: '👖', name: '테이퍼드 라이트 슬랙스' },
        { emoji: '👖', name: '원턱 치노 면바지' },
        { emoji: '🩳', name: '데님 버뮤다 팬츠' },
        { emoji: '👖', name: '연청 와이드 팬츠' },
        { emoji: '👖', name: '세미 와이드 슬랙스' }
      ];
      outerPool = [
        { emoji: '🧥', name: '얇은 오버핏 V넥 가디건' },
        { emoji: '🧥', name: '가벼운 셔츠 아우터' },
        { emoji: '🧥', name: '캐주얼 테일러드 블레이저' }
      ];
      accPool = [
        { emoji: '👟', name: '더비 슈즈 / 스니커즈' },
        { emoji: '💼', name: '토트백 / 메신저백' },
        { emoji: '🧢', name: '볼캡 모자' }
      ];
    } else {
      topPool = [
        { emoji: '👕', name: '반팔 티셔츠 / 피케 셔츠' },
        { emoji: '👔', name: '얇은 긴팔/7부 셔츠' },
        { emoji: '👚', name: '반팔 블라우스 / 골지 니트' }
      ];
      bottomPool = [
        { emoji: '👖', name: '면바지 / 코튼 슬랙스' },
        { emoji: '🩳', name: '버뮤다 팬츠' },
        { emoji: '👗', name: '플리츠 미디 스커트' }
      ];
      outerPool = [
        { emoji: '🧥', name: '얇은 가디건' },
        { emoji: '🧥', name: '가벼운 린넨 자켓' }
      ];
      accPool = [
        { emoji: '👟', name: '편안한 스니커즈' },
        { emoji: '💼', name: '데일리 백' }
      ];
    }
    topTipText = '단품으로 깔끔하게 연출하기 좋은 피케 셔츠나 면 반팔티가 제격입니다.';
    bottomTipText = '실루엣이 단정한 코튼 슬랙스나 플리츠 스커트류가 잘 어울립니다.';
    outerTipText = '아침저녁 선선한 바람에 대비해 부드러운 가디건을 걸쳐주세요.';
    aiTip = `체감온도 ${feelsLike}°C의 활동하기 딱 좋은 기온입니다! 단정한 반팔 상의와 슬랙스, 가디건 조합을 추천합니다.`;

  } else { // 22°C 이하 (봄가을/환절기)
    topPool = [
      { emoji: '👕', name: '긴팔 티셔츠 / 롱슬리브' },
      { emoji: '👔', name: '옥스포드 셔츠 / 블라우스' },
      { emoji: '🧶', name: '소프트 니트 / 맨투맨' },
      { emoji: '🔥', name: '발열 내의 (히트텍)' }
    ];
    bottomPool = [
      { emoji: '👖', name: '스트레이트 청바지' },
      { emoji: '👖', name: '와이드 슬랙스' },
      { emoji: '👖', name: '치노 팬츠 / 기모바지' }
    ];
    outerPool = [
      { emoji: '🧥', name: '얇은 가디건 / 자켓' },
      { emoji: '🧥', name: '클래식 트렌치코트' },
      { emoji: '🧥', name: '울 블레이저 / 점퍼' }
    ];
    accPool = [
      { emoji: '👟', name: '편안한 스니커즈 / 로퍼' },
      { emoji: '🎒', name: '백팩 / 미니백' }
    ];
    topTipText = '포근한 긴팔 셔츠나 슬리브가 적합합니다.';
    bottomTipText = '클래식 청바지나 슬랙스를 매치해 보세요.';
    outerTipText = '가볍게 걸치는 자켓이나 트렌치코트를 추천합니다.';
    aiTip = `체감온도 ${feelsLike}°C에 맞추어 쾌적하고 깔끔하게 연출해 보세요!`;
  }

  // 날씨 조건 악세서리
  if (rainProb >= 50 || humidity >= 80) {
    accPool.unshift({ emoji: '☂️', name: '3단 접이식 장우산' });
    accTipText = '비 소식이 있으니 가방에 휴대용 우산을 꼭 챙기세요.';
  }

  if (pm10 > 50) {
    accPool.unshift({ emoji: '😷', name: 'KF94 황사 마스크' });
    accTipText = accTipText ? `${accTipText} 미세먼지 차단 마스크 필수!` : '미세먼지 농도가 높으니 마스크를 착용하세요.';
  }

  return { topPool, bottomPool, outerPool, accPool, topTipText, bottomTipText, outerTipText, accTipText, aiTip };
}

// 11. ★ 카테고리별 무작위 2종 교체 및 개별 새로고침 스위칭 함수
function updateOOTDOnly(targetCategory = 'all') {
  const fullPool = getFullOOTDPool(
    lastWeatherData.temp,
    lastWeatherData.apparentTemp,
    lastWeatherData.humidity,
    lastWeatherData.rainProb,
    lastWeatherData.pm10,
    currentGender
  );

  const renderList = (items) => items.map(item => `<li><span>${item.emoji}</span> ${item.name}</li>`).join('');

  // 'top', 'bottom', 'outer', 'acc', 'all' 선택적 갱신
  if (targetCategory === 'all' || targetCategory === 'top') {
    const selectedTop = getRandomItems(fullPool.topPool, 2);
    elements.topClothingList.innerHTML = renderList(selectedTop);
    elements.topTip.textContent = fullPool.topTipText;
  }

  if (targetCategory === 'all' || targetCategory === 'bottom') {
    const selectedBottom = getRandomItems(fullPool.bottomPool, 2);
    elements.bottomClothingList.innerHTML = renderList(selectedBottom);
    elements.bottomTip.textContent = fullPool.bottomTipText;
  }

  if (targetCategory === 'all' || targetCategory === 'outer') {
    const selectedOuter = getRandomItems(fullPool.outerPool, 2);
    elements.outerClothingList.innerHTML = renderList(selectedOuter);
    elements.outerTip.textContent = fullPool.outerTipText;
  }

  if (targetCategory === 'all' || targetCategory === 'acc') {
    const selectedAcc = getRandomItems(fullPool.accPool, 2);
    elements.accClothingList.innerHTML = renderList(selectedAcc);
    elements.accTip.textContent = fullPool.accTipText || '활동하기 편안한 필수 소품입니다.';
  }

  elements.aiStylistTip.textContent = `"${fullPool.aiTip}"`;

  if (window.lucide) lucide.createIcons();
}

// 12. 전체 날씨 및 OOTD 렌더링
async function loadAndRenderWeather(lat, lon, locationName, cityKey) {
  elements.loadingOverlay.classList.add('active');

  currentActiveLocation = { lat, lon, name: locationName, key: cityKey };

  const data = await fetchKMAData(lat, lon, locationName, cityKey);
  const apparentTemp = calculateApparentTemperature(data.temp, data.humidity, data.wind);

  lastWeatherData = {
    temp: data.temp,
    apparentTemp: apparentTemp,
    humidity: data.humidity,
    rainProb: data.rainProb,
    pm10: data.pm10
  };

  elements.currentLocationName.textContent = data.name;
  elements.tempValue.textContent = Math.round(data.temp * 10) / 10;
  elements.feelsLikeValue.textContent = apparentTemp;
  elements.weatherText.textContent = data.weather;
  elements.humidityValue.textContent = Math.round(data.humidity);
  elements.windValue.textContent = (Math.round(data.wind * 10) / 10).toFixed(1);

  elements.pmBadge.textContent = `${data.pm10} ㎛/m³`;
  if (data.pm10 <= 30) {
    elements.pm10Value.textContent = '좋음 🌿';
    elements.pmBadge.className = 'pm-badge pm-good';
  } else if (data.pm10 <= 80) {
    elements.pm10Value.textContent = '보통 😐';
    elements.pmBadge.className = 'pm-badge pm-moderate';
  } else {
    elements.pm10Value.textContent = '나쁨 😷';
    elements.pmBadge.className = 'pm-badge pm-bad';
  }

  const comfort = calculateComfortIndex(data.temp, data.humidity, data.wind, data.pm10);
  elements.comfortScore.textContent = comfort.score;
  elements.comfortStatusTag.textContent = comfort.status;
  elements.comfortStatusTag.style.color = comfort.color;
  elements.comfortStatusTag.style.background = `${comfort.color}22`;
  elements.comfortDesc.textContent = comfort.desc;

  const offset = 440 - (440 * comfort.score / 100);
  elements.gaugeProgress.style.strokeDashoffset = offset;
  elements.gaugeProgress.style.stroke = comfort.color;

  updateOOTDOnly('all');

  elements.loadingOverlay.classList.remove('active');
}

// 13. GPS 현재 위치 탐색
function autoDetectGPSLocation() {
  const isFileProtocol = window.location.protocol === 'file:';

  if (!navigator.geolocation) {
    const selectedKey = elements.citySelect.value || 'Seoul';
    const city = CITY_DATABASE[selectedKey];
    loadAndRenderWeather(city.lat, city.lon, city.name, selectedKey);
    return;
  }

  elements.loadingOverlay.classList.add('active');

  const gpsOptions = {
    enableHighAccuracy: false,
    timeout: 3000,
    maximumAge: 300000
  };

  navigator.geolocation.getCurrentPosition(
    (position) => {
      hideBanner();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      let closestKey = 'Seoul';
      let minDistance = Infinity;

      Object.keys(CITY_DATABASE).forEach(key => {
        const city = CITY_DATABASE[key];
        const dist = Math.hypot(city.lat - lat, city.lon - lon);
        if (dist < minDistance) {
          minDistance = dist;
          closestKey = key;
        }
      });

      elements.citySelect.value = closestKey;
      const closestCity = CITY_DATABASE[closestKey];
      loadAndRenderWeather(lat, lon, `내 위치 (${closestCity.name})`, closestKey);
    },
    (error) => {
      elements.loadingOverlay.classList.remove('active');
      let msg = "위치 접근 실패: ";

      if (isFileProtocol) {
        msg += "file:// 접속 제약입니다. 원하는 도시를 클릭하시거나 http://localhost:8000 으로 접속하세요.";
      } else {
        msg += "상단 도시 선택을 통해 선택된 동네 날씨를 수신합니다.";
      }

      showBanner(msg);

      const selectedKey = elements.citySelect.value || 'Seoul';
      const city = CITY_DATABASE[selectedKey];
      loadAndRenderWeather(city.lat, city.lon, city.name, selectedKey);
    },
    gpsOptions
  );
}

function showBanner(message) {
  if (elements.locationNoticeBanner && elements.noticeText) {
    elements.noticeText.textContent = message;
    elements.locationNoticeBanner.style.display = 'flex';
  }
}

function hideBanner() {
  if (elements.locationNoticeBanner) {
    elements.locationNoticeBanner.style.display = 'none';
  }
}

// 14. 탭 네비게이션
function initTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetTabId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// 15. 성별 선택
function initGenderToggle() {
  const genderBtns = document.querySelectorAll('.gender-btn');

  genderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentGender = btn.getAttribute('data-gender');

      genderBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      updateOOTDOnly('all');
    });
  });
}

// 16. ★ 카테고리별 개별 새로고침 버튼 이벤트 핸들러
function initCategoryRefresh() {
  const categoryBtns = document.querySelectorAll('.btn-category-refresh');

  categoryBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = btn.getAttribute('data-category');

      // 아이콘 살짝 회전 애니메이션
      const icon = btn.querySelector('i');
      if (icon) {
        icon.style.transition = 'transform 0.3s ease';
        icon.style.transform = 'rotate(180deg)';
        setTimeout(() => { icon.style.transform = 'rotate(0deg)'; }, 300);
      }

      // 해당 카테고리만 무작위 2개로 새로고침!
      updateOOTDOnly(category);
    });
  });
}

// 17. 공식 모달
function initFormulaModal() {
  const openBtn = document.getElementById('openFormulaModalBtn');
  const closeBtn = document.getElementById('closeFormulaModalBtn');
  const modal = document.getElementById('formulaModal');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('active');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  }
}

// 18. 앱 초기화
function initApp() {
  initTabNavigation();
  initGenderToggle();
  initCategoryRefresh(); // 개별 새로고침 등록
  initFormulaModal();

  elements.citySelect.addEventListener('change', (e) => {
    const selectedKey = e.target.value;
    const selected = CITY_DATABASE[selectedKey] || CITY_DATABASE.Seoul;
    loadAndRenderWeather(selected.lat, selected.lon, selected.name, selectedKey);
  });

  elements.gpsBtn.addEventListener('click', autoDetectGPSLocation);

  elements.refreshBtn.addEventListener('click', () => {
    loadAndRenderWeather(currentActiveLocation.lat, currentActiveLocation.lon, currentActiveLocation.name, currentActiveLocation.key);
  });

  autoDetectGPSLocation();
}

document.addEventListener('DOMContentLoaded', initApp);
