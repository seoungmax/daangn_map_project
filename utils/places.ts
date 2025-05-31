const dotenv = require('dotenv');
const { Restaurant } = require('../types/restaurant');

// .env 파일 로드
dotenv.config({ path: '.env.local' });

const COMPANY_POSITION = {
  lat: 37.5063416,
  lng: 127.0567483,
};

const MAX_DISTANCE = 10; // km를 10km로 확장
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// 제거할 패턴들
const REMOVE_PATTERNS = [
  /\(.*?\)/g,  // 괄호와 그 안의 내용
  /[0-9]+호점/g,  // 숫자+호점
  /[0-9]+점/g,   // 숫자+점
  /[0-9]+호/g,   // 숫자+호
  /[0-9]+st/g,   // 숫자+st
  /[0-9]+nd/g,   // 숫자+nd
  /[0-9]+rd/g,   // 숫자+rd
  /[0-9]+th/g,   // 숫자+th
  /강남/g,       // 강남
  /논현/g,       // 논현
  /선릉/g,       // 선릉
  /역삼/g,       // 역삼
  /삼성/g,       // 삼성
];

function cleanRestaurantName(name: string): string {
  let cleaned = name;
  
  // 모든 패턴에 대해 제거
  for (const pattern of REMOVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // 앞뒤 공백 제거
  cleaned = cleaned.trim();
  
  // 특수문자를 공백으로 변경
  cleaned = cleaned.replace(/[_\.]/g, ' ');
  
  return cleaned;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function isInTargetDistrict(address: string): boolean {
  const targetDistricts = ['강남구', '서초구'];
  return targetDistricts.some(district => address.includes(district));
}

const searchRestaurant = async (name: string, address: string): Promise<Restaurant | null> => {
  try {
    const cleanedName = cleanRestaurantName(name);
    const searchQuery = `${cleanedName} ${address}`;
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=formatted_address,name,place_id,geometry,rating,user_ratings_total&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'ZERO_RESULTS') {
      console.log(`No results found for ${name}`);
      return null;
    }

    let allCandidates: any[] = [];

    if (data.candidates && data.candidates.length > 0) {
      allCandidates = allCandidates.concat(data.candidates);
    }

    if (allCandidates.length === 0) {
      console.log(`No valid candidates found for ${name}`);
      return null;
    }

    // 가장 적절한 후보 선택
    const bestCandidate = allCandidates[0];
    const distance = calculateDistance(
      COMPANY_POSITION.lat,
      COMPANY_POSITION.lng,
      bestCandidate.geometry.location.lat,
      bestCandidate.geometry.location.lng
    );

    if (distance > MAX_DISTANCE) {
      console.log(`Restaurant ${name} is too far (${distance.toFixed(2)}km)`);
      return null;
    }

    const restaurant: Restaurant = {
      id: bestCandidate.place_id,
      name: cleanedName,
      originalName: name,
      address: bestCandidate.formatted_address,
      position: {
        lat: bestCandidate.geometry.location.lat,
        lng: bestCandidate.geometry.location.lng
      },
      rating: bestCandidate.rating || 0,
      reviews: bestCandidate.user_ratings_total || 0,
      distance: distance,
      placeId: bestCandidate.place_id,
      googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${bestCandidate.place_id}`
    };

    return restaurant;
  } catch (error) {
    console.error(`Error searching for restaurant ${name}:`, error);
    return null;
  }
};

async function processRestaurantData(csvData: any[], testMode: boolean = true): Promise<Restaurant[]> {
  const restaurants: Restaurant[] = [];
  const processedNames = new Set<string>();

  for (const record of csvData) {
    const name = record['가맹점명'];
    const address = record['주소'];

    if (!name || !address || !isInTargetDistrict(address)) {
      continue;
    }

    const cleanedName = cleanRestaurantName(name);
    if (processedNames.has(cleanedName)) {
      continue;
    }

    const restaurant = await searchRestaurant(name, address);
    if (restaurant) {
      restaurants.push(restaurant);
      processedNames.add(cleanedName);

      if (testMode && restaurants.length >= 5) {
        break;
      }
    }
  }

  return restaurants;
}

module.exports = {
  cleanRestaurantName,
  calculateDistance,
  isInTargetDistrict,
  searchRestaurant,
  processRestaurantData,
  COMPANY_POSITION,
  MAX_DISTANCE
}; 