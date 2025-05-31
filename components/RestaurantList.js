export default function RestaurantList({ restaurants, selectedRestaurant, onSelectRestaurant }) {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">음식점 목록</h2>
      <div className="space-y-2">
        {restaurants.map((restaurant) => (
          <div
            key={restaurant.id}
            className={`p-3 rounded-lg cursor-pointer transition-colors ${
              selectedRestaurant?.id === restaurant.id
                ? 'bg-blue-100 border-blue-500'
                : 'bg-white border-gray-200 hover:bg-gray-50'
            } border`}
            onClick={() => onSelectRestaurant(restaurant)}
          >
            <h3 className="font-semibold">{restaurant.name}</h3>
            <p className="text-sm text-gray-600">{restaurant.address}</p>
          </div>
        ))}
      </div>
    </div>
  );
} 