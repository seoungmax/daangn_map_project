'use client';

import { useEffect, useState, useCallback } from 'react';
import Map from '../components/Map';
import { Restaurant } from '../types/restaurant';

export default function Home() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // 디버깅용 상태 표시
  console.log('Page state:', { 
    restaurantsCount: restaurants.length, 
    isLoading, 
    error, 
    retryCount,
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'Set' : 'Not set'
  });

  const loadRestaurants = useCallback(async () => {
    try {
      if (restaurants.length > 0) return;
      
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/data/restaurants.json', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`데이터 로드 실패 (${response.status}): ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('맛집 데이터가 없습니다.');
      }
      
      const uniqueData = data.filter((restaurant, index, self) =>
        index === self.findIndex((r) => r.id === restaurant.id)
      );
      
      setRestaurants(uniqueData);
      setRetryCount(0);
    } catch (err) {
      console.error('Error loading restaurants:', err);
      let errorMessage = '맛집 데이터를 불러오는데 실패했습니다.';
      
      if (err instanceof Error) {
        if (err.message.includes('데이터가 없습니다')) {
          errorMessage = '현재 표시할 맛집 정보가 없습니다. 잠시 후 다시 시도해주세요.';
        } else if (err.message.includes('로드 실패')) {
          errorMessage = '서버에서 데이터를 가져오는데 실패했습니다. 잠시 후 다시 시도해주세요.';
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [restaurants.length]);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  const handleRetry = useCallback(() => {
    if (retryCount >= 3) {
      setError('여러 번 시도했으나 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    setRetryCount(prev => prev + 1);
    loadRestaurants();
  }, [retryCount, loadRestaurants]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">맛집 데이터를 불러오는 중...</p>
          {retryCount > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              재시도 중... ({retryCount}/3)
            </p>
          )}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">데이터 로드 실패</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="space-y-2">
            {retryCount < 3 && (
              <button 
                onClick={handleRetry}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                다시 시도
              </button>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="block w-full text-sm text-gray-600 hover:text-gray-900 mt-2"
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-full" style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <Map restaurants={restaurants} />
    </main>
  );
} 