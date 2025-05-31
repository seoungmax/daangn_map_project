'use client';

import { useEffect, useState } from 'react';
import Map from '../components/Map';
import { Restaurant } from '../types/restaurant';

export default function Home() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRestaurants = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log('Fetching restaurant data...');
        const response = await fetch('/data/restaurants.json');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to load restaurant data: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Loaded restaurants:', data.length);
        setRestaurants(data);
      } catch (err) {
        console.error('Error loading restaurants:', err);
        setError(err instanceof Error ? err.message : '맛집 데이터를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadRestaurants();
  }, []);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">맛집 데이터를 불러오는 중...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center text-red-500">
          <p className="mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen">
      <Map restaurants={restaurants} />
    </main>
  );
} 