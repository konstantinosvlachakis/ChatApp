
const isProduction = process.env.NODE_ENV === "production";

export const BASE_URL: string = isProduction
  ? "https://langvoyage-d3781c6fad54.herokuapp.com"
  : "http://127.0.0.1:8000";

export const BASE_URL_IMG: string = isProduction
 ? `${BASE_URL}/`
 : `${BASE_URL}/media/`;
