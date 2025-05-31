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
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  
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

  // 줌 레벨별 오버레이 개수 (업체 이름 텍스트)
  const getMaxOverlaysForZoom = useCallback((zoom: number) => {
    if (zoom <= 15) return 0;  // 15 이하에서는 텍스트 없음
    if (zoom <= 16) return 5;  // 16에서는 5개
    if (zoom <= 17) return 8;  // 17에서는 8개
    return 10; // 18 이상에서는 최대 10개
  }, []);

  // 마커 스타일 설정 함수 - 50위까지는 순위 마커, 51위부터는 보라색 점
  const getMarkerIcon = useCallback((restaurant: Restaurant, isSelected: boolean, currentZoomLevel: number) => {
    if (isSelected) {
      // 선택된 마커는 핀 모양 (원형이 내부에 있는 형태)
      return {
        path: 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z',
        fillColor: '#FF6B00', // 선택된 마커는 주황색
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
        scale: 2,
        anchor: new google.maps.Point(12, 22),
      };
    }
    
    // 50위까지는 순위가 표시되는 원형 마커
    if (restaurant.rank && restaurant.rank <= 50) {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#9C27B0', // 보라색
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
      };
    }
    
    // 51위부터는 작은 보라색 점
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6, // 더 작은 크기
      fillColor: '#9C27B0',
      fillOpacity: 0.8,
      strokeColor: '#FFFFFF',
      strokeWeight: 1,
    };
  }, []);

  // 줌 레벨에 따라 오버레이 업데이트하는 함수 - 강화된 규칙 적용
  const updateOverlaysBasedOnZoom = useCallback((currentZoomLevel: number) => {
    if (!map || !restaurants.length || !createOverlayRef.current) return;
    
    try {
      // 기존 오버레이 모두 제거
      overlays.forEach(overlay => {
        overlay.setMap(null);
      });
      setOverlays([]); // 상태 초기화
      
      // 줌 레벨에 따른 최대 오버레이 개수 계산
      const maxOverlays = getMaxOverlaysForZoom(currentZoomLevel);
      
      // 오버레이가 0개인 경우 (줌 레벨 15 이하) 리턴
      if (maxOverlays === 0) {
        return;
      }
      
      // 지도 경계 가져오기
      const bounds = map.getBounds();
      if (!bounds) return;
      
      // 현재 화면에 보이는 레스토랑들만 필터링
      const visibleRestaurants = restaurants
        .filter(restaurant => {
          if (!restaurant.position || !restaurant.rank) return false;
          const position = new google.maps.LatLng(restaurant.position.lat, restaurant.position.lng);
          return bounds.contains(position);
        })
        .sort((a, b) => {
          // 평점 높은 순서로 정렬
          if (a.rating !== b.rating) return b.rating - a.rating;
          // 평점이 같으면 순위 높은 순
          return (a.rank || 0) - (b.rank || 0);
        });

      // 마커와의 거리 기준으로 텍스트 위치 최적화
      const overlayPositions: { lat: number; lng: number; name: string; restaurant: Restaurant }[] = [];
      const minPixelDistance = 50; // 50px 이내
      
      // 지도 projection을 사용하여 픽셀 거리 계산
      const projection = map.getProjection();
      if (!projection) return;

      // 최대 개수까지만 처리
      const candidateRestaurants = visibleRestaurants.slice(0, maxOverlays * 2); // 여유있게 2배수로 후보 선정

      for (const restaurant of candidateRestaurants) {
        if (!restaurant.position || overlayPositions.length >= maxOverlays) break;
        
        const { lat, lng } = restaurant.position;
        const position = new google.maps.LatLng(lat, lng);
        const pixel = projection.fromLatLngToPoint(position);
        
        if (!pixel) continue;
        
        // 기존 오버레이들과의 픽셀 거리 계산
        const hasCollision = overlayPositions.some(existing => {
          const existingPosition = new google.maps.LatLng(existing.lat, existing.lng);
          const existingPixel = projection.fromLatLngToPoint(existingPosition);
          if (!existingPixel) return false;
          
          const pixelDistance = Math.sqrt(
            Math.pow((pixel.x - existingPixel.x) * Math.pow(2, currentZoomLevel), 2) + 
            Math.pow((pixel.y - existingPixel.y) * Math.pow(2, currentZoomLevel), 2)
          );
          return pixelDistance < minPixelDistance;
        });
        
        if (!hasCollision) {
          overlayPositions.push({ lat, lng, name: restaurant.name, restaurant });
        }

        // 최대 개수 도달 시 중단
        if (overlayPositions.length >= maxOverlays) break;
      }
      
      // 최소 개수에 미달하는 경우 거리 제한을 완화하여 추가 (줌 레벨 17 이상에서만)
      const minOverlays = currentZoomLevel >= 17 ? Math.min(5, maxOverlays) : 0;
      if (overlayPositions.length < minOverlays && visibleRestaurants.length >= minOverlays) {
        const relaxedPixelDistance = 30; // 더 짧은 거리
        
        for (const restaurant of candidateRestaurants) {
          if (!restaurant.position || overlayPositions.length >= minOverlays) break;
          
          // 이미 추가된 레스토랑은 건너뛰기
          if (overlayPositions.some(existing => existing.restaurant.id === restaurant.id)) continue;
          
          const { lat, lng } = restaurant.position;
          const position = new google.maps.LatLng(lat, lng);
          const pixel = projection.fromLatLngToPoint(position);
          
          if (!pixel) continue;
          
          const hasCollision = overlayPositions.some(existing => {
            const existingPosition = new google.maps.LatLng(existing.lat, existing.lng);
            const existingPixel = projection.fromLatLngToPoint(existingPosition);
            if (!existingPixel) return false;
            
            const pixelDistance = Math.sqrt(
              Math.pow((pixel.x - existingPixel.x) * Math.pow(2, currentZoomLevel), 2) + 
              Math.pow((pixel.y - existingPixel.y) * Math.pow(2, currentZoomLevel), 2)
            );
            return pixelDistance < relaxedPixelDistance;
          });
          
          if (!hasCollision) {
            overlayPositions.push({ lat, lng, name: restaurant.name, restaurant });
          }
        }
      }
      
      // 새로운 오버레이 생성 및 적용
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
  }, [map, restaurants, selectedRestaurant, overlays, getMaxOverlaysForZoom]);

  // 마커 클릭 핸들러
  const handleMarkerClick = useCallback((restaurant: Restaurant, marker: google.maps.Marker) => {
    if (!map) return;

    // 이전 선택된 마커 스타일 초기화
    if (selectedMarker && selectedMarker !== marker) {
      selectedMarker.setIcon(getMarkerIcon(restaurant, false, zoomLevel));
    }

    // 같은 마커를 다시 클릭한 경우 선택 해제
    if (selectedMarker === marker) {
      marker.setIcon(getMarkerIcon(restaurant, false, zoomLevel));
      setSelectedMarker(null);
      setSelectedRestaurant(null);
      return;
    }

    // 새로운 마커 선택
    marker.setIcon(getMarkerIcon(restaurant, true, zoomLevel));
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
        selectedMarker.setIcon(getMarkerIcon(selectedRestaurant!, false, zoomLevel));
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

  // 지도 이동 이벤트 리스너 추가 (throttling 적용)
  useEffect(() => {
    if (!map) return;

    let timeoutId: NodeJS.Timeout | null = null;

    const boundsChangedListener = map.addListener('bounds_changed', () => {
      if (timeoutId) clearTimeout(timeoutId);
      
      timeoutId = setTimeout(() => {
        const currentZoomLevel = map.getZoom() || 15;
        if (createOverlayRef.current) {
          updateOverlaysBasedOnZoom(currentZoomLevel);
        }
      }, 300); // 300ms throttling
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      google.maps.event.removeListener(boundsChangedListener);
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
              padding: 2px 6px;
              font-size: 11px;
              font-weight: ${fontWeight};
              color: #000000;
              white-space: nowrap;
              transform: translate(-50%, -100%);
              box-shadow: 0 1px 3px rgba(0,0,0,0.15);
              z-index: 1;
              pointer-events: none;
              margin-top: -8px;
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
    
    // 모든 레스토랑을 표시 (50위까지는 순위 마커, 51위부터는 점 마커)
    restaurants.forEach(restaurant => {
      if (!restaurant.position) return;
      
      try {
        const zIndexValue = restaurant.rank ? 1000 - restaurant.rank : 500;
        const isRanked = restaurant.rank && restaurant.rank <= 50;
        
        const marker = new google.maps.Marker({
          position: restaurant.position,
          map: map,
          title: restaurant.rank ? `${restaurant.name} (${restaurant.rank}위)` : restaurant.name,
          // 50위까지만 순위 라벨 표시
          label: isRanked ? {
            text: restaurant.rank?.toString() || '',
            className: 'marker-label',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 'bold',
          } : undefined,
          icon: getMarkerIcon(restaurant, selectedRestaurant?.id === restaurant.id, currentZoomLevel),
          zIndex: zIndexValue,
          optimized: true,
        });

        marker.addListener('click', () => handleMarkerClick(restaurant, marker));
        newMarkers.push(marker);
      } catch (err) {
        console.error('Error creating marker:', err);
      }
    });

    setMarkers(newMarkers);
    
    // 초기 오버레이 설정
    updateOverlaysBasedOnZoom(currentZoomLevel);
    
  }, [map, restaurants, getMarkerIcon, handleMarkerClick, selectedRestaurant, updateOverlaysBasedOnZoom]);

  // 줌 레벨이나 선택된 레스토랑이 변경될 때만 스타일 업데이트
  useEffect(() => {
    if (!map || !markers.length) return;
    
    markers.forEach(marker => {
      const restaurant = restaurants.find(r => 
        r.position && marker.getPosition() &&
        Math.abs(r.position.lat - marker.getPosition()!.lat()) < 0.0001 && 
        Math.abs(r.position.lng - marker.getPosition()!.lng()) < 0.0001
      );
      if (restaurant) {
        marker.setIcon(getMarkerIcon(restaurant, selectedRestaurant?.id === restaurant.id, zoomLevel));
      }
    });
    
    updateOverlaysBasedOnZoom(zoomLevel);
  }, [zoomLevel, selectedRestaurant, getMarkerIcon, updateOverlaysBasedOnZoom]);

  // 순위 목록에서 음식점 선택 핸들러
  const handleRestaurantListClick = useCallback((restaurant: Restaurant) => {
    if (!map || !restaurant.position) return;

    // 사이드 패널 닫기
    setSidePanelOpen(false);

    // 해당 마커 찾기
    const targetMarker = markers.find(marker => {
      const position = marker.getPosition();
      return position && 
        Math.abs(position.lat() - restaurant.position.lat) < 0.0001 && 
        Math.abs(position.lng() - restaurant.position.lng) < 0.0001;
    });

    if (targetMarker) {
      // 이전 선택된 마커 초기화
      if (selectedMarker) {
        selectedMarker.setIcon(getMarkerIcon(restaurant, false, zoomLevel));
      }

      // 새로운 마커 선택
      targetMarker.setIcon(getMarkerIcon(restaurant, true, zoomLevel));
      setSelectedMarker(targetMarker);
      setSelectedRestaurant(restaurant);

      // 지도 이동 및 줌
      map.panTo(restaurant.position);
      map.setZoom(17);

      if (onRestaurantSelect) {
        onRestaurantSelect(restaurant);
      }
    }
  }, [map, markers, selectedMarker, zoomLevel, getMarkerIcon, onRestaurantSelect]);

  // 성능 최적화를 위한 가상화된 레스토랑 목록
  const getVisibleRestaurants = useCallback(() => {
    const sortedRestaurants = restaurants
      .filter(restaurant => restaurant.rank !== undefined)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));
    
    // 성능을 위해 처음 100개 항목만 렌더링
    return sortedRestaurants.slice(0, 100);
  }, [restaurants]);

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
      {/* 햄버거 메뉴 버튼 - 토글 기능 */}
      <button
        onClick={() => setSidePanelOpen(!sidePanelOpen)}
        className="fixed top-4 right-4 w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-all duration-200 z-50"
        style={{ zIndex: 1001 }}
        aria-label={sidePanelOpen ? "메뉴 닫기" : "메뉴 열기"}
      >
        <div className="relative w-6 h-6">
          {/* 햄버거 아이콘 */}
          <div className={`absolute inset-0 transition-all duration-200 ${sidePanelOpen ? 'opacity-0 rotate-180' : 'opacity-100 rotate-0'}`}>
            <svg 
              className="w-6 h-6 text-white" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 6h16M4 12h16M4 18h16" 
              />
            </svg>
          </div>
          
          {/* X 아이콘 */}
          <div className={`absolute inset-0 transition-all duration-200 ${sidePanelOpen ? 'opacity-100 rotate-0' : 'opacity-0 rotate-180'}`}>
            <svg 
              className="w-6 h-6 text-white" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </div>
        </div>
      </button>

      {/* 사이드 패널 오버레이 */}
      {sidePanelOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
          onClick={() => setSidePanelOpen(false)}
          style={{ zIndex: 999 }}
        />
      )}

      {/* 바텀시트 스타일 패널 */}
      <div
        className={`fixed inset-x-0 bottom-0 bg-white shadow-2xl transition-transform duration-300 ease-in-out z-50 ${
          sidePanelOpen ? 'transform translate-y-0' : 'transform translate-y-full'
        }`}
        style={{ 
          zIndex: 1000,
          height: '85vh',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          paddingTop: 'env(safe-area-inset-top, 0px)', // safe area 고려
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        {/* 드래그 핸들 */}
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-4" />
        
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">당근러가 사랑한 점심 맛집</h2>
            <p className="text-sm text-gray-500">총 {restaurants.length}개 음식점</p>
          </div>
        </div>

        {/* 순위 목록 */}
        <div 
          className="flex-1 overflow-y-auto" 
          style={{ 
            height: 'calc(85vh - 100px)', // 헤더와 핸들 공간 고려
            WebkitOverflowScrolling: 'touch' // iOS 모멘텀 스크롤링
          }}
        >
          <div className="px-6 py-4">
            {getVisibleRestaurants().map((restaurant, index, array) => (
              <div key={restaurant.id}>
                <div
                  onClick={() => handleRestaurantListClick(restaurant)}
                  className="bg-white py-4 cursor-pointer hover:bg-gray-50 transition-colors duration-200 active:bg-gray-100"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRestaurantListClick(restaurant);
                    }
                  }}
                >
                  <div className="flex items-start space-x-3">
                    {/* 순위 배지 */}
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{restaurant.rank}</span>
                    </div>
                    
                    {/* 음식점 정보 */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 truncate">
                        {restaurant.name}
                      </h3>
                      
                      {/* 별점 및 리뷰 */}
                      <div className="flex items-center mt-1 space-x-2">
                        <div className="flex items-center">
                          <span className="text-yellow-400 text-sm">⭐</span>
                          <span className="ml-1 text-sm font-medium text-gray-700">
                            {restaurant.rating.toFixed(1)}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          ({restaurant.reviews}개 리뷰)
                        </span>
                      </div>

                      {/* 주소 */}
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {restaurant.address}
                      </p>

                      {/* 거리 */}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-blue-600 font-medium">
                          회사에서 {restaurant.distance.toFixed(1)}km
                        </span>
                        <div className="flex items-center text-xs text-gray-400">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          지도에서 보기
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* 구분선 - 마지막 항목이 아닌 경우에만 표시 */}
                {index < array.length - 1 && (
                  <div className="border-b border-gray-100" />
                )}
              </div>
            ))}
            
            {/* 더 많은 항목이 있을 경우 안내 메시지 */}
            {restaurants.length > 100 && (
              <div className="text-center py-6 text-sm text-gray-500">
                상위 100개 음식점을 표시하고 있습니다
              </div>
            )}
          </div>
        </div>
      </div>

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
      {selectedRestaurant && selectedMarker && !sidePanelOpen && (
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