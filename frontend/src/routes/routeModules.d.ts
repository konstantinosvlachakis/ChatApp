// Types for routeModules.js, so TypeScript pages can preload a route (e.g. People → chat).
import type { ComponentType, LazyExoticComponent } from "react";

type PreloadableRoute = LazyExoticComponent<ComponentType<any>> & { preload: () => Promise<unknown> };

export const HowItWorksPage: PreloadableRoute;
export const ExchangePairPage: PreloadableRoute;
export const PrivacyPolicyPage: PreloadableRoute;
export const TermsAndConditionsPage: PreloadableRoute;
export const ForgotPasswordPage: PreloadableRoute;
export const ResetPasswordPage: PreloadableRoute;
export const VerifyEmailPage: PreloadableRoute;
export const ConversationsPage: PreloadableRoute;
export const ProfilePage: PreloadableRoute;
export const EditProfilePage: PreloadableRoute;
export const CommunityPage: PreloadableRoute;
export const SettingsPage: PreloadableRoute;
export const PublicProfilePage: PreloadableRoute;
export const PracticePage: PreloadableRoute;
export const PhrasebookPage: PreloadableRoute;
export const PremiumPage: PreloadableRoute;
export const ComparePlansPage: PreloadableRoute;
export const ROUTE_PRELOAD_TIMEOUT_MS: number;
export function findRouteComponent(pathname: string): PreloadableRoute | null;
export function preloadRoute(pathname: string, timeoutMs?: number): Promise<boolean>;
