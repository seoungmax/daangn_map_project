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

  // 줌 레벨별 최대 마커 수 최적화 (모바일 성능 고려)
  const getMaxMarkersForZoom = useCallback((zoom: number) => {
    if (zoom <= 12) return 10;
    if (zoom <= 14) return 20;
    if (zoom <= 16) return 40;
    if (zoom <= 17) return 60;
    return 80; // 최대 80개로 제한
  }, []);

  // 마커 스타일 설정 함수 - 파란색으로 변경하고 모든 줌 레벨에서 일관된 크기
  const getMarkerIcon = useCallback((isSelected: boolean, currentZoomLevel: number) => {
    if (isSelected) {
      // 선택된 마커는 핀 모양 (원형이 내부에 있는 형태)
      return {
        path: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
        fillColor: '#2196F3', // 파란색으로 변경
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
        scale: 2,
        anchor: new google.maps.Point(12, 22),
      };
    }
    // 일반 마커는 모든 줌 레벨에서 일관된 원형 크기
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 12, // 모든 줌 레벨에서 동일한 크기
      fillColor: '#2196F3', // 파란색으로 변경
      fillOpacity: 1,
      strokeColor: '#FFFFFF',
      strokeWeight: 2,
    };
  }, []);

  // 줌 레벨에 따라 오버레이 업데이트하는 함수 - 개선된 텍스트 겹침 방지
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
      // 최대 10개의 가게 이름만 표시 (성능 및 가독성 향상)
      const maxOverlays = 10;
      
      // 상위 레스토랑 필터링 (순위 기준 상위 30개에서 선별)
      const topRestaurants = restaurants
        .filter(restaurant => restaurant.rank !== undefined && restaurant.rank <= 30)
        .sort((a, b) => (a.rank || 0) - (b.rank || 0));
      
      // 텍스트 겹침 방지를 위한 충돌 감지 시스템
      const overlayPositions: { lat: number; lng: number; name: string; restaurant: Restaurant }[] = [];
      const minDistance = 0.002; // 최소 거리 (약 200m)
      
      // 순위가 높은 순서로 위치 충돌 검사하며 추가
      topRestaurants.forEach(restaurant => {
        if (!restaurant.position || overlayPositions.length >= maxOverlays) return;
        
        const { lat, lng } = restaurant.position;
        
        // 기존 오버레이들과의 거리 계산
        const hasCollision = overlayPositions.some(existing => {
          const distance = Math.sqrt(
            Math.pow(lat - existing.lat, 2) + Math.pow(lng - existing.lng, 2)
          );
          return distance < minDistance;
        });
        
        // 충돌이 없으면 추가
        if (!hasCollision) {
          overlayPositions.push({ lat, lng, name: restaurant.name, restaurant });
        }
      });
      
      // 최종 선별된 레스토랑들로 오버레이 생성
      const newOverlays: google.maps.OverlayView[] = [];
      
      overlayPositions.forEach(({ lat, lng, name, restaurant }) => {
        if (createOverlayRef.current) {
          try {
            const overlay = createOverlayRef.current(
              new google.maps.LatLng(lat, lng),
              name,
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
  }, [map, restaurants, selectedRestaurant]);

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
        if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
          throw new Error('Google Maps API 키가 설정되지 않았습니다.');
        }
        
        if (!mapRef.current) {
          throw new Error('지도를 표시할 요소를 찾을 수 없습니다.');
        }
        
        const loader = new Loader({
          apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
          version: 'weekly',
          libraries: ['places'],
        });

        const googleMaps = await loader.load().catch((error) => {
          throw new Error(`Google Maps API 로드 실패: ${error.message}`);
        });
        
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
          zoomControl: true,
          scaleControl: false,
          rotateControl: false,
          // 모바일 성능 최적화 설정
          gestureHandling: 'greedy',
          disableDoubleClickZoom: false,
          keyboardShortcuts: false,
          // 렌더링 최적화
          backgroundColor: '#f0f0f0',
          clickableIcons: false, // POI 클릭 비활성화로 성능 향상
        };
        
        // 맵 요소 스타일 설정
        if (mapRef.current) {
          mapRef.current.style.width = '100%';
          mapRef.current.style.height = '100%';
        }
        
        const mapInstance = new googleMaps.maps.Map(mapRef.current, mapOptions);

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
        } catch (markerError) {
          console.error('Error creating company marker:', markerError);
        }
      } catch (error) {
        console.error('Error loading Google Maps:', error);
        let errorMessage = '지도를 불러오는데 실패했습니다.';
        
        if (error instanceof Error) {
          if (error.message.includes('API 키')) {
            errorMessage = '지도 서비스 설정에 문제가 있습니다. 잠시 후 다시 시도해주세요.';
          } else if (error.message.includes('로드 실패')) {
            errorMessage = '지도 서비스 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
          }
        }
        
        setError(errorMessage);
        setMapLoaded(false);
      }
    };

    if (!mapLoaded) {
      initMap();
    }
  }, [mapLoaded]);

  useEffect(() => {
    // 맵이 로드되었고 줌 레벨이 변경된 경우 오버레이 업데이트
    if (map && mapLoaded && createOverlayRef.current) {
      const currentZoomLevel = map.getZoom() || 15;
      updateOverlaysBasedOnZoom(currentZoomLevel);
    }
  }, [map, mapLoaded, zoomLevel]);

  // 레스토랑 데이터가 변경될 때만 마커 업데이트
  useEffect(() => {
    if (!map || !restaurants.length) return;
    
    // 이전 마커와 오버레이 제거
    markers.forEach(marker => marker.setMap(null));
    overlays.forEach(overlay => overlay.setMap(null));
    
    const newMarkers: google.maps.Marker[] = [];
    const currentZoomLevel = map.getZoom() || 15;
    const maxMarkers = getMaxMarkersForZoom(currentZoomLevel);
    
    // 상위 음식점만 필터링 (성능 최적화)
    const filteredRestaurants = restaurants
      .filter(restaurant => restaurant.rank !== undefined && restaurant.rank <= maxMarkers)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));
    
    filteredRestaurants.forEach(restaurant => {
      if (!restaurant.position) return;
      
      try {
        const zIndexValue = 1000 - (restaurant.rank || 0);
        
        const marker = new google.maps.Marker({
          position: restaurant.position,
          map: map,
          title: `${restaurant.name} (${restaurant.rank}위)`,
          label: {
            text: restaurant.rank?.toString() || '',
            className: 'marker-label',
            color: '#FFFFFF',
            fontSize: '12px', // 폰트 크기 최적화
            fontWeight: 'bold',
          },
          icon: getMarkerIcon(selectedRestaurant?.id === restaurant.id, currentZoomLevel),
          zIndex: zIndexValue,
          optimized: true, // 성능 최적화 옵션
        });

        marker.addListener('click', () => handleMarkerClick(restaurant, marker));
        newMarkers.push(marker);
      } catch (err) {
        console.error('Error creating marker:', err);
      }
    });

    setMarkers(newMarkers);
    
    // 초기 오버레이 설정 (줌 레벨 17 이상에서만)
    if (currentZoomLevel >= 17) {
      updateOverlaysBasedOnZoom(currentZoomLevel);
    }
    
  }, [map, restaurants, getMaxMarkersForZoom]); // 의존성 배열 최적화

  // 줌 레벨이나 선택된 레스토랑이 변경될 때만 스타일 업데이트
  useEffect(() => {
    if (!map || !markers.length) return;
    
    markers.forEach(marker => {
      const restaurant = restaurants.find(r => 
        r.position.lat === marker.getPosition()?.lat() && 
        r.position.lng === marker.getPosition()?.lng()
      );
      if (restaurant) {
        marker.setIcon(getMarkerIcon(selectedRestaurant?.id === restaurant.id, zoomLevel));
      }
    });
    
    updateOverlaysBasedOnZoom(zoomLevel);
  }, [zoomLevel, selectedRestaurant]); // 의존성 배열에서 불필요한 항목들 제거

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 rounded-lg p-6">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">지도 로드 실패</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="space-y-2">
            <button 
              onClick={() => {
                setError(null);
                setMapLoaded(false);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              다시 시도
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="block w-full text-sm text-gray-600 hover:text-gray-900 mt-2"
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ minHeight: '100vh', position: 'relative' }}>
      <div 
        ref={mapRef} 
        id="google-map"
        className="w-full h-full rounded-lg shadow-lg" 
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '100vh',
          position: 'absolute', 
          top: 0, 
          left: 0,
          zIndex: 1,
          backgroundColor: '#f0f0f0'
        }}
      />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80" style={{ zIndex: 10 }}>
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

      <style>
        {`
          #google-map {
            width: 100% !important;
            height: 100% !important;
            min-height: 100vh !important;
          }
          .gm-style {
            width: 100% !important;
            height: 100% !important;
          }
        `}
      </style>
    </div>
  );
} 