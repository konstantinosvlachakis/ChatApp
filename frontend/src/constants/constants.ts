
const isProduction = process.env.NODE_ENV === "production";

export const BASE_URL: string = isProduction
  ? "https://langvoyage-d3781c6fad54.herokuapp.com"
  : "http://localhost:3000";

export const BASE_URL_IMG =`${BASE_URL}`
