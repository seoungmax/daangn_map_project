import { Restaurant } from '../types/restaurant';

export default function RestaurantInfo({ restaurant }: { restaurant: Restaurant }) {
  return (
    <div className="p-2 max-w-sm">
      <h3 className="font-bold text-lg mb-2">{restaurant.name}</h3>
      <p className="text-sm text-gray-600 mb-2">{restaurant.address}</p>
      
      {restaurant.rating && (
        <div className="flex items-center mb-1">
          <span className="text-yellow-400">★</span>
          <span className="ml-1">{restaurant.rating}</span>
          {restaurant.reviews && (
            <span className="ml-2 text-sm text-gray-500">
              ({restaurant.reviews} reviews)
            </span>
          )}
        </div>
      )}

      {restaurant.openingHours && (
        <div className="text-sm mb-2">
          <p className="font-semibold">영업시간:</p>
          {restaurant.openingHours.map((hours, index) => (
            <p key={index}>{hours}</p>
          ))}
        </div>
      )}

      {restaurant.website && (
        <a
          href={restaurant.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 text-sm hover:underline block mb-2"
        >
          웹사이트 방문
        </a>
      )}

      {restaurant.googleMapsUrl && (
        <a
          href={restaurant.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 text-sm hover:underline block"
        >
          구글 지도에서 보기
        </a>
      )}
    </div>
  );
} 