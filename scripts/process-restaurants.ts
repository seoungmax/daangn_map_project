const path = require('path');
const fs = require('fs');
const places = require('../utils/places');

interface Restaurant {
  id: number;
  name: string;
  originalName: string;
  address: string;
  position: {
    lat: number;
    lng: number;
  };
  rating?: number;
  reviews?: number;
  distance?: number;
  rank?: number;
  placeId?: string;
  googleMapsUrl?: string;
}

async function main() {
  try {
    // 기존 JSON 파일 읽기
    const jsonFilePath = path.join(__dirname, '..', 'data', 'restaurants.json');
    const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
    const restaurants: Restaurant[] = JSON.parse(fileContent);

    // 순위 부여
    restaurants.forEach((restaurant, index) => {
      restaurant.rank = index + 1;
    });

    // 결과를 JSON 파일로 저장
    fs.writeFileSync(jsonFilePath, JSON.stringify(restaurants, null, 2));

    console.log(`처리된 음식점 수: ${restaurants.length}`);
    console.log(`결과가 ${jsonFilePath}에 저장되었습니다.`);
  } catch (error) {
    console.error('Error processing restaurants:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

main(); 