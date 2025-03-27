'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Restaurant } from '../types/restaurant';

interface MapProps {
  restaurants: Restaurant[];
  onRestaurantSelect?: (restaurant: Restaurant) => void;
}

export default function Map({ restaurants = [], onRestaurantSelect }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [overlays, setOverlays] = useState<google.maps.OverlayView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(15);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<google.maps.Marker | null>(null);
  
  // createOverlay 함수를 저장하는 ref를 생성
  const createOverlayRef = useRef<((position: google.maps.LatLng, name: string, isSelected: boolean) => google.maps.OverlayView) | null>(null);

  // 마커 스타일 설정 함수
  const getMarkerIcon = useCallback((isSelected: boolean, currentZoomLevel: number) => {
    if (isSelected) {
      // 선택된 마커는 핀 모양 (원형이 내부에 있는 형태)
      return {
        path: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
        fillColor: '#FF6B00',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
        scale: 2,
        anchor: new google.maps.Point(12, 22),
      };
    }
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: currentZoomLevel > 18 ? 6 : 12,
      fillColor: currentZoomLevel > 18 ? '#FFFFFF' : '#FF6B00',
      fillOpacity: 1,
      strokeColor: currentZoomLevel > 18 ? '#FFFFFF' : '#FFFFFF',
      strokeWeight: 2,
    };
  }, []);

  // 줌 레벨에 따라 오버레이 업데이트하는 함수 - 함수 위치를 먼저 선언하도록 이동
  const updateOverlaysBasedOnZoom = useCallback((currentZoomLevel: number) => {
    if (!map || !restaurants.length || !createOverlayRef.current) return;
    
    // 기존 오버레이 제거
    overlays.forEach(overlay => overlay.setMap(null));
    
    // 줌 레벨 15 이하에서는 오버레이 전혀 표시 안함
    if (currentZoomLevel <= 15) {
      setOverlays([]);
      return;
    }
    
    try {
      // 줌 레벨에 따라 표시할 레스토랑 수 결정
      let maxRestaurantsToShow = 100;
      if (currentZoomLevel <= 16) {
        maxRestaurantsToShow = 20;
      } else if (currentZoomLevel <= 17) {
        maxRestaurantsToShow = 50;
      }
      
      // 상위 레스토랑 필터링
      const filteredRestaurants = restaurants
        .filter(restaurant => restaurant.rank !== undefined && restaurant.rank <= maxRestaurantsToShow)
        .sort((a, b) => (a.rank || 0) - (b.rank || 0));
      
      // 레스토랑 위치를 그리드로 분할하여 같은 영역에 여러 레스토랑이 있을 경우 순위가 높은 것만 오버레이 표시
      const gridSize = currentZoomLevel <= 16 ? 0.0008 : 0.0004; // 줌 레벨에 따라 그리드 크기 조정
      
      // JavaScript 기본 Map 객체 사용
      const gridMap = new Map();
      
      // 각 레스토랑을 그리드에 할당
      filteredRestaurants.forEach(restaurant => {
        if (!restaurant.position) return; // 위치 정보가 없는 경우 건너뜀
        
        const gridX = Math.floor(restaurant.position.lat / gridSize);
        const gridY = Math.floor(restaurant.position.lng / gridSize);
        const gridKey = `${gridX}-${gridY}`;
        
        // 해당 그리드에 레스토랑이 없거나, 새 레스토랑의 순위가 더 높은 경우 업데이트
        const existingRestaurant = gridMap.get(gridKey);
        if (!existingRestaurant || (existingRestaurant.rank || 999) > (restaurant.rank || 999)) {
          gridMap.set(gridKey, restaurant);
        }
      });
      
      // 그리드별로 하나씩만 오버레이 생성
      const newOverlays: google.maps.OverlayView[] = [];
      
      // 타입 안정성을 위해 명시적으로 타입 처리
      gridMap.forEach((restaurant: any) => {
        if (createOverlayRef.current && restaurant && restaurant.position) {
          try {
            const overlay = createOverlayRef.current(
              new google.maps.LatLng(
                restaurant.position.lat,
                restaurant.position.lng
              ),
              restaurant.name,
              selectedRestaurant?.id === restaurant.id
            );
            overlay.setMap(map);
            newOverlays.push(overlay);
          } catch (err) {
            console.error("Error creating overlay:", err);
          }
        }
      });
      
      setOverlays(newOverlays);
    } catch (error) {
      console.error("Error in updateOverlaysBasedOnZoom:", error);
    }
  }, [map, restaurants, overlays, selectedRestaurant]);

  // 마커 클릭 핸들러
  const handleMarkerClick = useCallback((restaurant: Restaurant, marker: google.maps.Marker) => {
    if (!map) return;

    // 이전 선택된 마커 스타일 초기화
    if (selectedMarker && selectedMarker !== marker) {
      selectedMarker.setIcon(getMarkerIcon(false, zoomLevel));
    }

    // 같은 마커를 다시 클릭한 경우 선택 해제
    if (selectedMarker === marker) {
      marker.setIcon(getMarkerIcon(false, zoomLevel));
      setSelectedMarker(null);
      setSelectedRestaurant(null);
      return;
    }

    // 새로운 마커 선택
    marker.setIcon(getMarkerIcon(true, zoomLevel));
    setSelectedMarker(marker);
    setSelectedRestaurant(restaurant);

    // 선택된 마커로 지도 중심 이동 및 줌
    map.panTo(restaurant.position);
    const currentZoom = map.getZoom();
    if (currentZoom !== undefined && currentZoom < 17) {
      map.setZoom(17);
    }
    
    if (onRestaurantSelect) {
      onRestaurantSelect(restaurant);
    }
  }, [map, selectedMarker, zoomLevel, getMarkerIcon, onRestaurantSelect]);

  // 지도 클릭 핸들러 (빈 공간 클릭 시 선택 해제)
  useEffect(() => {
    if (!map) return;

    const mapClickListener = map.addListener('click', () => {
      if (selectedMarker) {
        selectedMarker.setIcon(getMarkerIcon(false, zoomLevel));
        setSelectedMarker(null);
        setSelectedRestaurant(null);
      }
    });

    return () => {
      google.maps.event.removeListener(mapClickListener);
    };
  }, [map, selectedMarker, zoomLevel, getMarkerIcon]);

  useEffect(() => {
    if (!map) return;

    const zoomListener = map.addListener('zoom_changed', () => {
      const currentZoomLevel = map.getZoom() || 15;
      setZoomLevel(currentZoomLevel);
      
      // 줌 레벨에 따라 오버레이 처리
      if (createOverlayRef.current) {
        updateOverlaysBasedOnZoom(currentZoomLevel);
      }
    });

    return () => {
      google.maps.event.removeListener(zoomListener);
    };
  }, [map, updateOverlaysBasedOnZoom]);

  // Google Maps 로드 및 RestaurantOverlay 클래스 생성
  useEffect(() => {
    const initMap = async () => {
      try {
        console.log('Initializing Google Maps...');
        console.log('API Key:', process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'exists' : 'not found');
        
        if (!mapRef.current) {
          throw new Error('Map container not found');
        }
        
        const loader = new Loader({
          apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
          version: 'weekly',
          libraries: ['places'],
        });

        const googleMaps = await loader.load();
        console.log('Google Maps loaded successfully');
        
        // RestaurantOverlay 클래스 정의
        class RestaurantOverlay extends googleMaps.maps.OverlayView {
          private div: HTMLDivElement | null = null;
          private position: google.maps.LatLng;
          private name: string;
          private isSelected: boolean;

          constructor(position: google.maps.LatLng, name: string, isSelected: boolean = false) {
            super();
            this.position = position;
            this.name = name;
            this.isSelected = isSelected;
          }

          onAdd() {
            const div = document.createElement('div');
            div.className = 'custom-overlay';
            
            // 선택 여부에 따른 스타일 변경
            const borderColor = this.isSelected ? '#FF6B00' : '#CCCCCC';
            const fontWeight = this.isSelected ? 'bold' : 'normal';
            
            div.style.cssText = `
              position: absolute;
              background: white;
              border: 1.5px solid ${borderColor};
              border-radius: 6px;
              padding: 4px 8px;
              font-size: 12px;
              font-weight: ${fontWeight};
              color: #000000;
              white-space: nowrap;
              transform: translate(-50%, 120%);
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              z-index: 1;
            `;
            div.textContent = this.name;
            this.div = div;
            const panes = this.getPanes();
            panes?.overlayLayer.appendChild(div);
          }

          draw() {
            if (!this.div) return;
            
            const projection = this.getProjection();
            const position = projection.fromLatLngToDivPixel(this.position);
            
            if (position) {
              this.div.style.left = position.x + 'px';
              this.div.style.top = position.y + 'px';
            }
          }

          onRemove() {
            if (this.div) {
              this.div.parentNode?.removeChild(this.div);
              this.div = null;
            }
          }

          // 선택 상태 업데이트 메서드
          updateSelected(isSelected: boolean) {
            this.isSelected = isSelected;
            if (this.div) {
              const borderColor = isSelected ? '#FF6B00' : '#CCCCCC';
              const fontWeight = isSelected ? 'bold' : 'normal';
              this.div.style.border = `1.5px solid ${borderColor}`;
              this.div.style.fontWeight = fontWeight;
            }
          }
        }
        
        // createOverlay 함수 정의 - 안전하게 Overlay 인스턴스 생성
        const createOverlay = (position: google.maps.LatLng, name: string, isSelected: boolean) => {
          return new RestaurantOverlay(position, name, isSelected);
        };
        
        // 함수를 ref에 저장
        createOverlayRef.current = createOverlay;
        
        const mapOptions = {
          center: { lat: 37.503679, lng: 127.024293 }, // 회사 위치
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        };
        
        console.log('Creating map with options:', mapOptions);
        
        // 맵 요소 스타일 설정
        if (mapRef.current) {
          mapRef.current.style.width = '100%';
          mapRef.current.style.height = '100%';
        }
        
        const mapInstance = new googleMaps.maps.Map(mapRef.current, mapOptions);
        console.log('Map created successfully');

        setMap(mapInstance);
        setMapLoaded(true);

        // 회사 위치 마커
        try {
          const companyMarker = new googleMaps.maps.Marker({
            position: { lat: 37.503679, lng: 127.024293 },
            map: mapInstance,
            title: '당근마켓',
            icon: {
              url: '/company-marker.svg',
              scaledSize: new googleMaps.maps.Size(40, 40),
            },
          });
          console.log('Company marker created successfully');
        } catch (markerError) {
          console.error('Error creating company marker:', markerError);
        }
      } catch (error) {
        console.error('Error loading Google Maps:', error);
        setError(`지도를 불러오는데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    if (!mapLoaded) {
      initMap();
    }
  }, [mapLoaded]);

  useEffect(() => {
    // 맵이 로드되었고 줌 레벨이 변경된 경우 오버레이 업데이트
    if (map && mapLoaded && createOverlayRef.current) {
      updateOverlaysBasedOnZoom(zoomLevel);
    }
  }, [map, mapLoaded, zoomLevel, updateOverlaysBasedOnZoom]);

  useEffect(() => {
    if (!map || !restaurants.length) return;

    console.log('Received restaurants:', restaurants.length);
    console.log('First restaurant:', restaurants[0]);
    
    // 기존 마커와 오버레이 제거
    markers.forEach(marker => marker.setMap(null));
    overlays.forEach(overlay => overlay.setMap(null));
    const newMarkers: google.maps.Marker[] = [];
    
    // 줌 레벨에 따라 표시할 레스토랑 수 결정
    let maxRestaurantsToShow = 100;
    if (zoomLevel <= 13) {
      maxRestaurantsToShow = 10;
    } else if (zoomLevel <= 15) {
      maxRestaurantsToShow = 30;
    } else if (zoomLevel <= 16) {
      maxRestaurantsToShow = 50;
    }

    // 상위 음식점만 필터링
    const filteredRestaurants = restaurants
      .filter(restaurant => restaurant.rank !== undefined && restaurant.rank <= maxRestaurantsToShow)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));

    console.log('Filtered restaurants:', filteredRestaurants.length);
    
    // 음식점 마커 추가
    filteredRestaurants.forEach(restaurant => {
      if (!map) return;
      
      try {
        // 마커 생성 시 zIndex 설정 - 순위가 높을수록 위에 표시
        const zIndexValue = 1000 - (restaurant.rank || 0);
        
        const marker = new google.maps.Marker({
          position: restaurant.position,
          map: map,
          title: `${restaurant.name} (${restaurant.rank}위)`,
          label: {
            text: restaurant.rank?.toString() || '',
            className: 'marker-label',
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 'bold',
          },
          icon: getMarkerIcon(selectedRestaurant?.id === restaurant.id, zoomLevel),
          zIndex: zIndexValue
        });

        // 클릭 이벤트 수정
        marker.addListener('click', () => handleMarkerClick(restaurant, marker));

        newMarkers.push(marker);
      } catch (error) {
        console.error(`Error creating marker for ${restaurant.name}:`, error);
      }
    });

    console.log('Added restaurant markers:', newMarkers.length);
    setMarkers(newMarkers);
    
    // 초기 오버레이 설정 (createOverlay 함수가 있는 경우에만)
    if (createOverlayRef.current) {
      updateOverlaysBasedOnZoom(zoomLevel);
    }
    
  }, [map, restaurants, zoomLevel, getMarkerIcon, handleMarkerClick, selectedRestaurant, updateOverlaysBasedOnZoom]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div 
        ref={mapRef} 
        id="google-map"
        className="w-full h-full rounded-lg shadow-lg" 
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
      />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">지도를 불러오는 중...</p>
          </div>
        </div>
      )}
      
      {/* 바텀시트 */}
      {selectedRestaurant && selectedMarker && (
        <div 
          className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-lg transition-transform duration-300 ease-in-out"
          style={{ 
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '0 16px 16px 16px',
            transform: selectedRestaurant ? 'translateY(0)' : 'translateY(100%)',
            zIndex: 1000,
            maxWidth: '100%',
            margin: '0 auto',
            backgroundColor: 'white'
          }}
        >
          <div className="bg-white rounded-2xl shadow p-4 pt-3 pb-6">
            {/* 드래그 핸들 */}
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          
            {/* 기본 정보 - 수정된 순서 */}
            <div className="flex items-center mb-2">
              <div 
                className="flex items-center justify-center rounded-full bg-orange-100 w-6 h-6 mr-2"
                style={{ minWidth: '24px' }}
              >
                <span className="text-xs font-medium text-black">{selectedRestaurant.rank}</span>
              </div>
              <h2 className="text-lg font-bold text-black">{selectedRestaurant.name}</h2>
            </div>

            {/* 주소 */}
            <div className="text-sm text-gray-700 mb-2">
              {selectedRestaurant.address}
            </div>

            {/* 별점 및 후기 */}
            <div className="flex items-center text-sm mb-2">
              <span style={{ color: '#FF6B00' }}>★</span>
              <span className="ml-1 text-gray-800">{selectedRestaurant.rating.toFixed(1)}</span>
              <span className="ml-1 text-gray-500">({selectedRestaurant.reviews})</span>
            </div>
            
            {/* 거리 및 구글 지도 링크 */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">회사와의 거리: {selectedRestaurant.distance.toFixed(1)}km</span>
              <a
                href={selectedRestaurant.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 underline"
              >
                Google 지도에서 보기
              </a>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        #google-map {
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
    </div>
  );
} 