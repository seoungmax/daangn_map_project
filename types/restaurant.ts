export interface Restaurant {
  id: number;
  name: string;
  originalName: string;  // 원본 이름 (PG사 정보 등이 포함된 이름)
  address: string;
  position: {
    lat: number;
    lng: number;
  };
  category?: string;
  phone?: string;
  rating: number;
  reviews: number;
  openingHours?: string[];
  website?: string;
  googleMapsUrl: string;
  distance: number; // 회사로부터의 거리 (km)
  photos?: string[];
  priceLevel?: number;
  placeId: string;
  rank?: number;  // 순위 정보 추가
}

export {}; 