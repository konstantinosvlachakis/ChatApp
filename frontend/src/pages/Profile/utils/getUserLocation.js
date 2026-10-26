// utils/getUserLocation.js
export const getUserLocation = async () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Geolocation not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // Use a reverse geocoding API to get city + country from coordinates
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();

          resolve({
            city: data.city || data.locality || "Unknown",
            country: data.countryName || "Unknown",
          });
        } catch (err) {
          reject("Failed to fetch location data");
        }
      },
      (error) => reject(error.message)
    );
  });
};
